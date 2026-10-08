/**
 * Credential custody for the provider harness.
 *
 * Three separable concerns, kept separate on purpose: `SecretValue` owns the
 * in-memory handling of secret material, `CredentialStore` is the operation
 * surface every backend must satisfy, and `EncryptedFileCredentialStore` is the
 * one local backend this slice ships. The eventual target is OpenBao; it
 * becomes a second `CredentialStore` implementation and no call site changes.
 *
 * What the local store does and does not protect against, stated without
 * overstatement: the credential file is encrypted with AES-256-GCM, so a
 * secret never sits in plaintext on disk and cannot be read out of a stray
 * backup, a synced directory, or an accidental `cat`. The data-encryption key,
 * by default, is a 0600 file in the same directory. An attacker who can read
 * the state root as the owning user can therefore still decrypt. That is a
 * real limit, not a detail: encryption at rest here raises the bar above the
 * plaintext credential files most provider CLIs ship, and it does not stand in
 * for key management. The `key` option is the seam where key management moves
 * elsewhere — an OS keychain today, OpenBao's transit engine later — without
 * the on-disk envelope format changing.
 *
 * Ported from Andromeda `src/server/gateway/providers/credentials.ts`. In
 * Andromeda the 0600 file helpers lived private in this module and again in
 * `src/vault/files.ts`; the plugin keeps a single copy in `vault/files.ts` and
 * imports it here, so the two cannot drift into different durability
 * guarantees.
 * @module credentials/vault/secret
 */

import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { exists, writePrivateFile, writePrivateFileExclusive } from "./files.js";

const REDACTED = "[redacted]";
const CREDENTIAL_ID = /^[a-z][a-z0-9-]*$/;
const CREDENTIAL_SUFFIX = ".cred";
const KEY_FILE = "master.key";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const ALGORITHM = "aes-256-gcm";
const ENVELOPE_SCHEMA_VERSION = 1;
const NODE_INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * A secret string that does not leak through the accidental paths: string
 * interpolation, `JSON.stringify`, and console inspection all yield a redacted
 * placeholder. The value is held in a private field, so it is not reachable by
 * enumeration either. `reveal()` is the single, deliberately conspicuous way
 * out, and the only caller of it in this module is the encryption step.
 */
export class SecretValue {
  readonly #value: string;

  /** Constructs an instance. */
  constructor(value: string) {
    if (typeof value !== "string" || value.length === 0)
      throw new Error("secret value must be a non-empty string");
    this.#value = value;
  }

  /** Return the plaintext. Every call site is a place a secret can escape. */
  reveal(): string {
    return this.#value;
  }

  /** Constant-time comparison, so equality checks do not become an oracle. */
  equals(other: SecretValue): boolean {
    const left = Buffer.from(this.#value, "utf8");
    const right = Buffer.from(other.#value, "utf8");
    if (left.byteLength !== right.byteLength) return false;
    return timingSafeEqual(left, right);
  }

  /**
   * Returns a string representation of the SecretValue instance.
   *
   * Returns: A string indicating the type of the instance as 'SecretValue'.
   *
   * On failure: Throws no errors; returns a string indicating the type.
   */
  toString(): string {
    return REDACTED;
  }

  /** toJSON implementation. */
  toJSON(): string {
    return REDACTED;
  }

  /** [Symbol.toStringTag] implementation. */
  get [Symbol.toStringTag](): string {
    return "SecretValue";
  }
}

Object.defineProperty(SecretValue.prototype, NODE_INSPECT, {
  value: function inspect(): string {
    return `SecretValue(${REDACTED})`;
  },
  enumerable: false,
  writable: false,
  configurable: false,
});

/**
 * Persisted credential material. The `oauth` variant is declared now, and the
 * store round-trips it, so the OAuth slice adds flows rather than a storage
 * migration. `expiresAt` drives proactive refresh there; a null means the
 * credential does not expire, which is the normal case for an API key.
 */
export type ProviderCredential =
  | {
      kind: "api_key";
      apiKey: SecretValue;
      obtainedAt: string;
      expiresAt: string | null;
    }
  | {
      kind: "oauth";
      accessToken: SecretValue;
      refreshToken: SecretValue | null;
      expiresAt: string | null;
      refreshTokenExpiresAt: string | null;
      scopes: readonly string[];
      /** Plan identity when the token response carries one, as Claude Code's does. */
      subscriptionType: string | null;
      obtainedAt: string;
    };

/**
 * Operations every credential backend provides. Deliberately small: the local
 * encrypted-file store and a future OpenBao-backed store must both satisfy it
 * without either shape leaking into callers.
 *
 * A `watch` operation for out-of-band updates — a second terminal running a
 * login, or a Bao lease renewal — belongs here eventually. It is left out of
 * this slice because nothing yet holds a credential long enough to need it.
 */
export interface CredentialStore {
  /** Null when no credential is stored under this id. */
  get(id: string): Promise<ProviderCredential | null>;
  put(id: string, credential: ProviderCredential): Promise<void>;
  /** True when a credential was removed, false when there was nothing to remove. */
  delete(id: string): Promise<boolean>;
  /** Stored credential ids, sorted. */
  list(): Promise<string[]>;
}

/**
 * Directory holding provider credentials, given the manager-owned secrets root
 * (`SharedState.secretsDir`, which is `$ANDROMEDA_HOME/secrets` unless
 * `ANDROMEDA_SECRETS` overrides it). Provider credentials sit in a
 * subdirectory of the existing secrets root rather than in a new state root,
 * and the flat `*.secret` files the manager already keeps there are
 * undisturbed.
 */
export function providerCredentialDirectory(secretsDirectory: string): string {
  return path.join(secretsDirectory, "providers");
}

export interface EncryptedFileCredentialStoreOptions {
  /** Directory for credential files and, by default, the data-encryption key. */
  directory: string;
  /**
   * Externally managed 32-byte data-encryption key. Supply this to keep the key
   * out of the state root — from an OS keychain, or later from OpenBao. Omitted,
   * the store creates and reads a 0600 key file inside `directory`.
   */
  key?: Uint8Array;
}

interface CredentialEnvelope {
  schemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  algorithm: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  authTag: string;
}

type CredentialPayload =
  | { kind: "api_key"; apiKey: string; obtainedAt: string; expiresAt: string | null }
  | {
      kind: "oauth";
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
      refreshTokenExpiresAt: string | null;
      scopes: string[];
      subscriptionType: string | null;
      obtainedAt: string;
    };

/** Local credential backend: one AES-256-GCM encrypted file per credential id. */
export class EncryptedFileCredentialStore implements CredentialStore {
  readonly #directory: string;
  readonly #suppliedKey: Uint8Array | null;
  #key: Buffer | null = null;

  /** Constructs an instance. */
  constructor(options: EncryptedFileCredentialStoreOptions) {
    if (!options.directory.trim()) throw new Error("credential store requires a directory");
    if (options.key && options.key.byteLength !== KEY_BYTES) {
      throw new Error(`credential store key must be ${KEY_BYTES} bytes`);
    }
    this.#directory = path.resolve(options.directory);
    this.#suppliedKey = options.key ? Uint8Array.from(options.key) : null;
  }

  /**
   * Provides access to the credential store's directory and allows retrieving
   * credentials by their ID.
   *
   * @returns The path to the directory where credentials are stored.
   * @throws Throws an error if the directory is not provided or is invalid.
   * @throws Throws an error if the key for the credential store is invalid.
   * @throws Returns null if the requested credential ID does not exist.
   */
  get directory(): string {
    return this.#directory;
  }

  /** get implementation. */
  async get(id: string): Promise<ProviderCredential | null> {
    const file = this.#file(id);
    if (!(await exists(file))) return null;
    const envelope = parseEnvelope(await readFile(file, "utf8"), file);
    const key = await this.#dataKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, "base64"));
    // The credential id is authenticated, not encrypted: a file moved or
    // renamed under another id fails to decrypt instead of impersonating it.
    // jscpd:ignore-start -- mirrors vault/store.ts's / vault/record.ts's small field-normalizing blocks for different data shapes
    decipher.setAAD(Buffer.from(id, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    let plaintext: string;
    try {
      plaintext = decipher.update(envelope.ciphertext, "base64", "utf8") + decipher.final("utf8");
    } catch {
      throw new Error(
        // jscpd:ignore-end
        `credential cannot be decrypted, it may be corrupt or written under a different key: ${id}`,
      );
    }
    return decodeCredential(JSON.parse(plaintext) as unknown, id);
  }

  /**
   * Stores a provider credential securely.
   *
   * Guarantees the credential is encrypted and authenticated before writing to the file.
   * Throws an error if the credential cannot be decrypted, indicating it may be corrupt or written under a different key.
   *
   * @param id - The unique identifier for the credential.
   * @param credential - The provider credential to store.
   */
  async put(id: string, credential: ProviderCredential): Promise<void> {
    const file = this.#file(id);
    const key = await this.#dataKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(id, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(encodeCredential(credential)), "utf8"),
      cipher.final(),
    ]);
    const envelope: CredentialEnvelope = {
      schemaVersion: ENVELOPE_SCHEMA_VERSION,
      // jscpd:ignore-start -- mirrors vault/store.ts's / vault/record.ts's small field-normalizing blocks for different data shapes
      algorithm: ALGORITHM,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
    await writePrivateFile(file, `${JSON.stringify(envelope)}\n`);
  }

  /** delete implementation. */
  async delete(id: string): Promise<boolean> {
    const file = this.#file(id);
    if (!(await exists(file))) return false;
    await rm(file, { force: true });
    return true;
  }

  /** list implementation. */
  async list(): Promise<string[]> {
    if (!(await exists(this.#directory))) return [];
    const entries = await readdir(this.#directory, { withFileTypes: true });
    return (
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(CREDENTIAL_SUFFIX))
        // jscpd:ignore-end
        .map((entry) => entry.name.slice(0, -CREDENTIAL_SUFFIX.length))
        .filter((id) => CREDENTIAL_ID.test(id))
        .sort()
    );
  }

  /** #file implementation. */
  #file(id: string): string {
    if (!CREDENTIAL_ID.test(id)) throw new Error(`invalid credential id: ${id}`);
    return path.join(this.#directory, `${id}${CREDENTIAL_SUFFIX}`);
  }

  /** #dataKey implementation. */
  async #dataKey(): Promise<Buffer> {
    if (this.#key) return this.#key;
    if (this.#suppliedKey) {
      this.#key = Buffer.from(this.#suppliedKey);
      return this.#key;
    }
    this.#key = await loadOrCreateKeyFile(path.join(this.#directory, KEY_FILE));
    return this.#key;
  }
}

/**
 * Loads an existing key file or creates a new one if it doesn't exist.
 *
 * Returns the key file content as a Buffer.
 * Throws an error if the provided key is invalid or if the file cannot be created.
 */
async function loadOrCreateKeyFile(file: string): Promise<Buffer> {
  if (await exists(file)) {
    const key = Buffer.from((await readFile(file, "utf8")).trim(), "base64");
    if (key.byteLength !== KEY_BYTES) throw new Error(`credential key file is malformed: ${file}`);
    return key;
  }
  const created = randomBytes(KEY_BYTES);
  // Exclusive creation: two concurrent first writes must not each mint a key
  // and leave one set of credentials undecryptable.
  const published = await writePrivateFileExclusive(file, `${created.toString("base64")}\n`);
  if (published) return created;
  return loadOrCreateKeyFile(file);
}

/**
 * Encodes the credential key.
 *
 * Returns the encoded key as a Buffer.
 * Throws an error if the key is invalid or if there is an issue creating or reading the key file.
 */
function encodeCredential(credential: ProviderCredential): CredentialPayload {
  // Explicit field-by-field encoding, not JSON.stringify over the credential:
  // SecretValue redacts itself, so the only way plaintext reaches the cipher is
  // a visible reveal() call, and a new secret-bearing field cannot be
  // serialized by accident.
  if (credential.kind === "api_key") {
    return {
      kind: "api_key",
      apiKey: credential.apiKey.reveal(),
      obtainedAt: credential.obtainedAt,
      expiresAt: credential.expiresAt,
    };
  }
  return {
    kind: "oauth",
    accessToken: credential.accessToken.reveal(),
    refreshToken: credential.refreshToken ? credential.refreshToken.reveal() : null,
    expiresAt: credential.expiresAt,
    refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
    scopes: [...credential.scopes],
    subscriptionType: credential.subscriptionType,
    obtainedAt: credential.obtainedAt,
  };
}

/** decodeCredential implementation. */
function decodeCredential(value: unknown, id: string): ProviderCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`stored credential is not an object: ${id}`);
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "api_key") {
    return {
      kind: "api_key",
      apiKey: new SecretValue(requireString(record.apiKey, "apiKey", id)),
      obtainedAt: requireString(record.obtainedAt, "obtainedAt", id),
      expiresAt: optionalString(record.expiresAt, "expiresAt", id),
    };
  }
  if (record.kind === "oauth") {
    const refreshToken = optionalString(record.refreshToken, "refreshToken", id);
    return {
      kind: "oauth",
      accessToken: new SecretValue(requireString(record.accessToken, "accessToken", id)),
      refreshToken: refreshToken === null ? null : new SecretValue(refreshToken),
      expiresAt: optionalString(record.expiresAt, "expiresAt", id),
      refreshTokenExpiresAt: optionalString(
        record.refreshTokenExpiresAt,
        "refreshTokenExpiresAt",
        id,
      ),
      scopes: Array.isArray(record.scopes)
        ? record.scopes.map((scope) => requireString(scope, "scopes", id))
        : [],
      subscriptionType: optionalString(record.subscriptionType, "subscriptionType", id),
      obtainedAt: requireString(record.obtainedAt, "obtainedAt", id),
    };
  }
  throw new Error(`stored credential has an unsupported kind: ${id}`);
}

/**
 * Ensures the provided value is a non-empty string and throws an error if not.
 *
 * @param value - The value to check.
 * @param name - The name of the value for error messages.
 * @param id - The identifier for the credential being decoded.
 * @throws Will throw an error if `value` is undefined, null, or not a string.
 * @returns The string value if valid.
 */
function requireString(value: unknown, field: string, id: string): string {
  if (typeof value !== "string" || !value)
    // jscpd:ignore-start -- mirrors vault/store.ts's / vault/record.ts's small field-normalizing blocks for different data shapes
    throw new Error(`stored credential ${id} requires ${field}`);
  return value;
}

/** optionalString implementation. */
function optionalString(value: unknown, field: string, id: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new Error(`stored credential ${id} has a malformed ${field}`);
  // jscpd:ignore-end
  return value;
}

/** parseEnvelope implementation. */
function parseEnvelope(raw: string, file: string): CredentialEnvelope {
  const parsed = JSON.parse(raw) as Partial<CredentialEnvelope>;
  if (
    parsed.schemaVersion !== ENVELOPE_SCHEMA_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.authTag !== "string"
  ) {
    throw new Error(`invalid credential envelope: ${file}`);
  }
  return parsed as CredentialEnvelope;
}
