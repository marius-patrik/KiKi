/**
 * Where the vault's master key comes from.
 *
 * `EncryptedFileCredentialStore` states the limit honestly: it encrypts at rest
 * and, by default, keeps the key in a 0600 file beside the ciphertext, so an
 * attacker reading the state root as the owning user can still decrypt. That
 * limit is inherited here, and `MasterKeySource` is the seam that removes it.
 * An OS keychain or an OpenBao transit key becomes another implementation of
 * this one-method interface; nothing about the on-disk envelope changes.
 *
 * Three implementations ship:
 *
 * - `StaticMasterKey` wraps 32 bytes the caller already has. This is what an
 *   OpenBao or Keychain adapter will construct once it has unwrapped the key,
 *   and what tests use to stay fast.
 * - `PassphraseMasterKey` derives the key from a passphrase with scrypt. Chosen
 *   over PBKDF2 because PBKDF2 is cheap to accelerate: its inner loop needs
 *   almost no memory, so GPU and ASIC attackers get a throughput advantage of
 *   several orders of magnitude over the defender's CPU. scrypt's cost is
 *   dominated by random access to a large buffer, which does not parallelize
 *   cheaply, so the attacker's advantage stays close to their raw memory-
 *   bandwidth advantage. Argon2id would be the current first choice; Node's
 *   `crypto` does not expose it, and adding a dependency for it was ruled out,
 *   so scrypt — the memory-hard function that is in the standard library — is
 *   the correct available answer.
 * - `KeyFileMasterKey` keeps the existing behaviour: a random 32-byte key in a
 *   0600 file. No passphrase to type, and no protection against an attacker who
 *   can already read the directory. It is the default only because it is what
 *   an unattended daemon can actually use.
 *
 * Ported from Andromeda `src/vault/masterkey.ts`, with `Bun.file(...).text()`
 * replaced by node's `readFile` for the two file reads.
 * @module credentials/vault/masterkey
 */

import path from "node:path";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SecretValue } from "./secret.js";
import { exists, writePrivateFileExclusive } from "./files.js";

const KEY_BYTES = 32;
const KDF_FILE = "master.kdf";
const KEY_FILE = "master.key";
const KDF_SCHEMA_VERSION = 1;

/**
 * scrypt cost. N=2^17 with r=8 asks for 128 MiB and measures around a quarter
 * of a second on the development machine — enough that an offline guessing
 * campaign against a decent passphrase is not worth mounting, and short enough
 * that a human unlocking a vault does not notice.
 */
export const DEFAULT_SCRYPT_PARAMETERS = { N: 1 << 17, r: 8, p: 1 } as const;

/**
 * Floor below which the memory-hardness claim stops being true. 2^14 with r=8
 * is 16 MiB, the classic scrypt interactive-login figure. Anything weaker is
 * rejected rather than accepted with a warning, because a work factor that can
 * be quietly lowered is one that will be.
 */
export const MINIMUM_SCRYPT_N = 1 << 14;

export interface ScryptParameters {
  N: number;
  r: number;
  p: number;
}

/**
 * Supplies the 32-byte key the vault encrypts with. One method, so a remote
 * key manager is a small adapter rather than a refactor.
 */
export interface MasterKeySource {
  /** Where this key comes from, for the health view. Never includes key material. */
  readonly description: string;
  key(): Promise<Uint8Array>;
}

/** A key the caller already holds — from a keychain, an unwrap call, or a test. */
export class StaticMasterKey implements MasterKeySource {
  readonly description: string;
  readonly #key: Uint8Array;

  /** Constructs an instance. */
  constructor(key: Uint8Array, description = "static key supplied by the caller") {
    if (key.byteLength !== KEY_BYTES)
      throw new Error(`vault master key must be ${KEY_BYTES} bytes`);
    this.#key = Uint8Array.from(key);
    this.description = description;
  }

  /**
   * Returns a cached or newly derived Scrypt key as a Uint8Array.
   *
   * Guarantees a Scrypt key is returned, either from cache or by deriving from the passphrase and parameters.
   * On failure, returns the cached key if available; otherwise, attempts to load or create parameters and derive the key.
   *
   * @returns A Promise resolving to a Uint8Array representing the Scrypt key.
   */
  async key(): Promise<Uint8Array> {
    return Uint8Array.from(this.#key);
  }
}

export interface PassphraseMasterKeyOptions {
  /** Directory holding the KDF parameter file. Normally the vault directory. */
  directory: string;
  /**
   * Resolved lazily so a passphrase can come from a prompt, an agent, or an
   * environment variable without this module knowing which.
   */
  passphrase: SecretValue | (() => Promise<SecretValue> | SecretValue);
  scrypt?: Partial<ScryptParameters>;
}

/**
 * Derives the vault key from a passphrase with scrypt, persisting the salt and
 * work factor so the same passphrase reproduces the same key. The parameter
 * file is written exclusively: two processes racing on a first unlock must not
 * each mint a salt and leave one of them holding an undecryptable vault.
 */
export class PassphraseMasterKey implements MasterKeySource {
  readonly description = "passphrase-derived key (scrypt)";
  readonly #file: string;
  readonly #passphrase: PassphraseMasterKeyOptions["passphrase"];
  readonly #parameters: ScryptParameters;
  #cached: Uint8Array | null = null;

  /** Constructs an instance. */
  constructor(options: PassphraseMasterKeyOptions) {
    if (!options.directory.trim()) throw new Error("passphrase master key requires a directory");
    this.#file = path.join(path.resolve(options.directory), KDF_FILE);
    this.#passphrase = options.passphrase;
    this.#parameters = validateScryptParameters({
      ...DEFAULT_SCRYPT_PARAMETERS,
      ...options.scrypt,
    });
  }

  /** The parameter file this key reads and writes. */
  get parameterFile(): string {
    return this.#file;
  }

  /**
   * Provides the key as a Uint8Array, loading or creating it if not cached.
   *
   * @returns A Promise resolving to the key as a Uint8Array.
   * @throws Will throw an error if the directory is not provided when accessing the key.
   */
  async key(): Promise<Uint8Array> {
    if (this.#cached) return Uint8Array.from(this.#cached);
    const stored = await this.#loadOrCreateParameters();
    const passphrase =
      typeof this.#passphrase === "function" ? await this.#passphrase() : this.#passphrase;
    const derived = await deriveScryptKey(passphrase, stored.salt, stored.parameters);
    this.#cached = derived;
    return Uint8Array.from(derived);
  }

  /** #loadOrCreateParameters implementation. */
  async #loadOrCreateParameters(): Promise<{ salt: Uint8Array; parameters: ScryptParameters }> {
    if (await exists(this.#file))
      return parseKdfFile(await readFile(this.#file, "utf8"), this.#file);
    const salt = randomBytes(16);
    const document = {
      schemaVersion: KDF_SCHEMA_VERSION,
      kdf: "scrypt",
      salt: salt.toString("base64"),
      N: this.#parameters.N,
      r: this.#parameters.r,
      p: this.#parameters.p,
      keyBytes: KEY_BYTES,
    };
    const published = await writePrivateFileExclusive(this.#file, `${JSON.stringify(document)}\n`);
    if (published) return { salt: Uint8Array.from(salt), parameters: this.#parameters };
    return parseKdfFile(await readFile(this.#file, "utf8"), this.#file);
  }
}

export interface KeyFileMasterKeyOptions {
  directory: string;
  /** Defaults to `master.key`, matching `EncryptedFileCredentialStore`. */
  fileName?: string;
}

/**
 * A random key in a 0600 file. Protects a stolen backup or a synced directory;
 * does not protect against an attacker who can read the vault directory as the
 * owning user. That is the same bargain `EncryptedFileCredentialStore` makes,
 * and it is stated rather than implied.
 */
export class KeyFileMasterKey implements MasterKeySource {
  readonly description = "random key file beside the vault";
  readonly #file: string;
  #cached: Uint8Array | null = null;

  /** Constructs an instance. */
  constructor(options: KeyFileMasterKeyOptions) {
    if (!options.directory.trim()) throw new Error("key file master key requires a directory");
    this.#file = path.join(path.resolve(options.directory), options.fileName ?? KEY_FILE);
  }

  /**
   * Provides the path to the key file and loads or creates the key if not cached.
   *
   * @returns A Promise resolving to the key as a Uint8Array.
   * @throws Will throw an error if the directory is not provided.
   */
  get keyFile(): string {
    return this.#file;
  }

  /** key implementation. */
  async key(): Promise<Uint8Array> {
    if (this.#cached) return Uint8Array.from(this.#cached);
    this.#cached = await this.#loadOrCreate();
    return Uint8Array.from(this.#cached);
  }

  /** #loadOrCreate implementation. */
  async #loadOrCreate(): Promise<Uint8Array> {
    if (await exists(this.#file)) {
      const key = Buffer.from((await readFile(this.#file, "utf8")).trim(), "base64");
      if (key.byteLength !== KEY_BYTES)
        throw new Error(`vault key file is malformed: ${this.#file}`);
      return Uint8Array.from(key);
    }
    const created = randomBytes(KEY_BYTES);
    const published = await writePrivateFileExclusive(
      this.#file,
      `${created.toString("base64")}\n`,
    );
    if (published) return Uint8Array.from(created);
    return this.#loadOrCreate();
  }
}

/** scrypt, promisified, with `maxmem` raised to match the requested work factor. */
export async function deriveScryptKey(
  passphrase: SecretValue,
  salt: Uint8Array,
  parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS,
): Promise<Uint8Array> {
  const validated = validateScryptParameters(parameters);
  // Node's default maxmem is 32 MiB, well under what a memory-hard factor
  // needs; the ceiling is raised in step with N rather than removed.
  const maxmem = 256 * validated.N * validated.r * validated.p + 1024 * 1024;
  return new Promise<Uint8Array>((resolve, reject) => {
    scryptCallback(
      passphrase.reveal(),
      Buffer.from(salt),
      KEY_BYTES,
      { N: validated.N, r: validated.r, p: validated.p, maxmem },
      (error, derived) => (error ? reject(error) : resolve(Uint8Array.from(derived))),
    );
  });
}

/** Reject a work factor that would make "memory-hard" untrue. */
export function validateScryptParameters(parameters: ScryptParameters): ScryptParameters {
  const { N, r, p } = parameters;
  if (!Number.isInteger(N) || N < MINIMUM_SCRYPT_N || (N & (N - 1)) !== 0) {
    throw new Error(`scrypt N must be a power of two of at least ${MINIMUM_SCRYPT_N}, got ${N}`);
  }
  if (!Number.isInteger(r) || r < 8) throw new Error(`scrypt r must be at least 8, got ${r}`);
  if (!Number.isInteger(p) || p < 1) throw new Error(`scrypt p must be at least 1, got ${p}`);
  return { N, r, p };
}

/** Constant-time key comparison, for tests and for key-rotation checks. */
export function sameKey(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/**
 * Parses a KDF file string into its salt and scrypt parameters.
 *
 * @param raw - The JSON-encoded string representing the KDF file.
 * @param file - The name of the file being parsed, used for error messages.
 * @returns An object containing the salt as a Uint8Array and the scrypt parameters.
 * @throws Will throw an error if the JSON is malformed or if the parameters are invalid.
 */
function parseKdfFile(
  raw: string,
  file: string,
): { salt: Uint8Array; parameters: ScryptParameters } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`vault kdf parameters are malformed: ${file}`);
  }
  if (
    parsed.schemaVersion !== KDF_SCHEMA_VERSION ||
    parsed.kdf !== "scrypt" ||
    typeof parsed.salt !== "string"
  ) {
    throw new Error(`vault kdf parameters are malformed: ${file}`);
  }
  const salt = Buffer.from(parsed.salt, "base64");
  if (salt.byteLength < 16) throw new Error(`vault kdf salt is too short: ${file}`);
  return {
    salt: Uint8Array.from(salt),
    parameters: validateScryptParameters({
      N: Number(parsed.N),
      r: Number(parsed.r),
      p: Number(parsed.p),
    }),
  };
}
