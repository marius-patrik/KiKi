/**
 * Vault storage: `EncryptedFileCredentialStore` generalized from two provider
 * credential shapes to every secret type in `record.ts`.
 *
 * The envelope format is deliberately the same design as the credential store's
 * — AES-256-GCM, one file per record, random 96-bit IV, authenticated
 * additional data binding the file to its identity — with one change. The
 * credential store authenticates the id alone; this authenticates the id *and*
 * the type. The type has to sit in the envelope header in the clear, because it
 * is needed to build the AAD before decryption can start, and putting it in the
 * AAD is what stops that cleartext field from being a lie: relabel a
 * `generic_note` as an `oauth_token` and the record fails to open rather than
 * arriving somewhere that treats notes as bearer tokens.
 *
 * Everything else — label, purpose, scope, tags, timestamps, material — is
 * inside the ciphertext. That costs a decryption per record to build the health
 * view, and buys not leaking "this machine holds a production AWS root
 * password" to anyone who can list the directory.
 *
 * `VaultCredentialStore` is the other half of the generalization: it presents
 * any vault as the `CredentialStore` the provider harness already speaks, so
 * `OAuthTokenRefresher` — with its single-flight refresh and its `invalid_grant`
 * handling — drives vault-stored tokens without a line changing in `oauth.ts`.
 *
 * Ported from Andromeda `src/vault/store.ts`, with the `CredentialStore` /
 * `ProviderCredential` types imported from `./secret.js` (the provider harness
 * surface this plugin ports) and the record codecs from `./record.js`.
 */

import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import type { CredentialStore, ProviderCredential } from "./secret.js";
import {
  createSecretRecord,
  descriptorOf,
  decodeSecretRecord,
  encodeSecretRecord,
  rotateSecretRecord,
  SECRET_TYPES,
  type SecretDescriptor,
  type SecretMaterial,
  type SecretRecord,
  type SecretScope,
  type SecretType,
} from "./record.js";
import { exists, writePrivateFile } from "./files.js";
import type { MasterKeySource } from "./masterkey.js";

const RECORD_ID = /^[a-z][a-z0-9-]*$/;
const RECORD_SUFFIX = ".vault";
const IV_BYTES = 12;
const ALGORITHM = "aes-256-gcm";
const ENVELOPE_SCHEMA_VERSION = 1;
/** Unit separator: cannot occur in a record id or a type name, so `id|type` is unambiguous. */
const AAD_SEPARATOR = "\u001f";

/**
 * Operations every vault backend provides. Same shape of contract as
 * `CredentialStore`, widened by one method: `describe` exists because the health
 * view and the audit log need to reason about every record without any of them
 * holding material.
 */
export interface VaultStore {
  /** Null when nothing is stored under this id. */
  get(id: string): Promise<SecretRecord | null>;
  put(record: SecretRecord): Promise<void>;
  /** True when a record was removed, false when there was nothing to remove. */
  delete(id: string): Promise<boolean>;
  /** Stored record ids, sorted. */
  list(): Promise<string[]>;
  /** Metadata for every record, material stripped. */
  describe(): Promise<SecretDescriptor[]>;
}

/**
 * Directory holding the vault, given the manager-owned secrets root. A sibling
 * of `providers/`, so the provider harness's own credential files and the
 * general keychain do not collide.
 */
export function vaultDirectory(secretsDirectory: string): string {
  return path.join(secretsDirectory, "vault");
}

export interface EncryptedFileVaultOptions {
  directory: string;
  /**
   * Where the 32-byte key comes from. Required — unlike the credential store
   * there is no implicit "mint a key file if none exists", because a vault
   * holding passwords and TOTP seeds should not silently choose its own
   * protection level. `KeyFileMasterKey` reproduces the old behaviour when that
   * is what the caller wants.
   */
  masterKey: MasterKeySource;
}

interface VaultEnvelope {
  schemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  algorithm: typeof ALGORITHM;
  id: string;
  type: SecretType;
  iv: string;
  ciphertext: string;
  authTag: string;
}

/** Local vault backend: one AES-256-GCM encrypted file per record id. */
export class EncryptedFileVault implements VaultStore {
  readonly #directory: string;
  readonly #masterKey: MasterKeySource;
  #key: Buffer | null = null;

  /** Constructs an instance. */
  constructor(options: EncryptedFileVaultOptions) {
    if (!options.directory.trim()) throw new Error("vault requires a directory");
    this.#directory = path.resolve(options.directory);
    this.#masterKey = options.masterKey;
  }

  /**
   * Retrieves a secret record by its ID from the vault.
   *
   * @param id - The ID of the secret record to retrieve.
   * @returns The secret record if found, otherwise null.
   * @throws Will throw an error if the record's envelope ID does not match the provided ID.
   */
  get directory(): string {
    return this.#directory;
  }

  /** Where the master key comes from, for the health view. Never key material. */
  get keyDescription(): string {
    return this.#masterKey.description;
  }

  /**
   * Retrieves a secret record by its ID.
   * @param id - The ID of the secret record to retrieve.
   * @returns The secret record if found and the envelope ID matches, otherwise null.
   * @throws Throws an error if the record's envelope ID does not match the provided ID.
   */
  async get(id: string): Promise<SecretRecord | null> {
    const file = this.#file(id);
    if (!(await exists(file))) return null;
    const envelope = parseEnvelope(await readFile(file, "utf8"), file);
    if (envelope.id !== id)
      throw new Error(`vault record ${id} carries a mismatched envelope id: ${envelope.id}`);
    const key = await this.#dataKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, "base64"));
    // jscpd:ignore-start -- mirrors vault/secret.ts's small field-normalizing block for a different data shape
    decipher.setAAD(aad(envelope.id, envelope.type));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    let plaintext: string;
    try {
      plaintext = decipher.update(envelope.ciphertext, "base64", "utf8") + decipher.final("utf8");
    } catch {
      throw new Error(
        // jscpd:ignore-end
        `vault record cannot be decrypted, it may be corrupt or written under a different key: ${id}`,
      );
    }
    const record = decodeSecretRecord(JSON.parse(plaintext) as unknown, id);
    if (record.type !== envelope.type) {
      throw new Error(
        `vault record ${id} declares ${record.type} but its envelope says ${envelope.type}`,
      );
    }
    return record;
  }

  /**
   * Stores a secret record securely.
   *
   * Guarantees that the provided record is of the expected type and encrypts it.
   * If the record type does not match the envelope type, throws an error.
   * On failure, throws an error indicating the record type mismatch or decryption failure.
   */
  async put(record: SecretRecord): Promise<void> {
    const file = this.#file(record.id);
    const key = await this.#dataKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(aad(record.id, record.type));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(encodeSecretRecord(record)), "utf8"),
      cipher.final(),
    ]);
    const envelope: VaultEnvelope = {
      schemaVersion: ENVELOPE_SCHEMA_VERSION,
      algorithm: ALGORITHM,
      id: record.id,
      // jscpd:ignore-start -- mirrors vault/secret.ts's small field-normalizing block for a different data shape
      type: record.type,
      iv: iv.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
    await writePrivateFile(file, `${JSON.stringify(envelope)}\n`);
  }

  /**
   * Deletes the secret record with the given ID from the vault.
   *
   * Guarantees that the record with the specified ID exists and is successfully deleted.
   * Returns `true` if the deletion is successful, `false` otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const file = this.#file(id);
    if (!(await exists(file))) return false;
    await rm(file, { force: true });
    return true;
  }

  /**
   * Deletes the secret record with the given ID from the vault.
   *
   * Guarantees that the record with the specified ID is successfully deleted.
   * Returns `true` if the deletion is successful, `false` if the record does not exist or deletion fails.
   */
  async list(): Promise<string[]> {
    if (!(await exists(this.#directory))) return [];
    const entries = await readdir(this.#directory, { withFileTypes: true });
    return (
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(RECORD_SUFFIX))
        // jscpd:ignore-end
        .map((entry) => entry.name.slice(0, -RECORD_SUFFIX.length))
        .filter((id) => RECORD_ID.test(id))
        .sort()
    );
  }

  /** describe implementation. */
  async describe(): Promise<SecretDescriptor[]> {
    const descriptors: SecretDescriptor[] = [];
    for (const id of await this.list()) {
      const record = await this.get(id);
      if (record) descriptors.push(descriptorOf(record));
    }
    return descriptors;
  }

  /** #file implementation. */
  #file(id: string): string {
    if (!RECORD_ID.test(id)) throw new Error(`invalid vault record id: ${id}`);
    return path.join(this.#directory, `${id}${RECORD_SUFFIX}`);
  }

  /** #dataKey implementation. */
  async #dataKey(): Promise<Buffer> {
    if (this.#key) return this.#key;
    const key = await this.#masterKey.key();
    if (key.byteLength !== 32) throw new Error("vault master key must be 32 bytes");
    this.#key = Buffer.from(key);
    return this.#key;
  }
}

/**
 * A vault that never touches disk. Not a test double bolted on afterwards: the
 * supervisor and the agent API are written against `VaultStore`, and a process
 * that unwraps its secrets from OpenBao at start-up has no reason to write
 * ciphertext to a local filesystem at all.
 */
export class MemoryVault implements VaultStore {
  readonly #records = new Map<string, SecretRecord>();

  /**
   * Retrieves the secret descriptor for the given record ID.
   *
   * @param id - The ID of the record to retrieve.
   * @returns The secret descriptor if the record exists; otherwise, undefined.
   * @throws Will throw an error if the provided ID is invalid.
   */
  async get(id: string): Promise<SecretRecord | null> {
    if (!RECORD_ID.test(id)) throw new Error(`invalid vault record id: ${id}`);
    return this.#records.get(id) ?? null;
  }

  /**
   * Retrieves the data key for the vault.
   *
   * Guarantees: Returns the data key as a Buffer if it exists; otherwise, fetches
   * and validates the key from the master key, then returns it.
   *
   * Throws: An error if the master key is not 32 bytes long.
   */
  async put(record: SecretRecord): Promise<void> {
    if (!RECORD_ID.test(record.id)) throw new Error(`invalid vault record id: ${record.id}`);
    this.#records.set(record.id, record);
  }

  /**
   * Stores and retrieves secrets in memory without touching disk.
   *
   * @param id - The unique identifier of the secret record.
   * @returns The path to the secret record file.
   * @throws Will throw an error if the provided id is invalid or does not match the expected format.
   */
  async delete(id: string): Promise<boolean> {
    return this.#records.delete(id);
  }

  /** list implementation. */
  async list(): Promise<string[]> {
    return [...this.#records.keys()].sort();
  }

  /** describe implementation. */
  async describe(): Promise<SecretDescriptor[]> {
    return (await this.list()).map((id) => descriptorOf(this.#records.get(id)!));
  }
}

export interface VaultCredentialStoreOptions {
  vault: VaultStore;
  /**
   * Metadata for a credential the refresher writes that the vault has not seen.
   * The default scope grants nobody: an auto-created record is storable and
   * refreshable but not readable until someone scopes it deliberately, so a
   * credential never becomes agent-readable as a side effect of a token refresh.
   */
  defaults?: (id: string) => {
    label: string;
    purpose: string;
    scope: SecretScope;
    tags?: readonly string[];
  };
  now?: () => number;
}

/**
 * Presents a vault as a `CredentialStore`. This is what lets the re-auth
 * supervisor hand vault records to the existing `OAuthTokenRefresher` instead of
 * reimplementing single-flight refresh, backoff, and `invalid_grant` handling.
 *
 * Only the two credential-shaped types are visible through it. A password or a
 * TOTP seed is not a provider credential, and `list()` reflecting them would
 * make the provider harness believe it could refresh things it cannot.
 */
export class VaultCredentialStore implements CredentialStore {
  readonly #vault: VaultStore;
  readonly #defaults: NonNullable<VaultCredentialStoreOptions["defaults"]>;
  readonly #now: () => number;

  /** Constructs an instance. */
  constructor(options: VaultCredentialStoreOptions) {
    this.#vault = options.vault;
    this.#now = options.now ?? (() => Date.now());
    this.#defaults =
      options.defaults ??
      ((id) => ({ label: id, purpose: id, scope: { workspace: "*", agents: [] } }));
  }

  /**
   * Retrieves the path to the secret record file for the given identifier.
   * @param id - The unique identifier of the secret record.
   * @returns The path to the secret record file if the identifier is valid.
   * @throws Will throw an error if the provided id is invalid or does not match the expected format.
   */
  async get(id: string): Promise<ProviderCredential | null> {
    const record = await this.#vault.get(id);
    if (!record) return null;
    if (record.type === "api_key") {
      return {
        kind: "api_key",
        apiKey: record.material.apiKey,
        obtainedAt: record.updatedAt,
        expiresAt: record.expiresAt,
      };
    }
    if (record.type === "oauth_token") {
      return {
        kind: "oauth",
        accessToken: record.material.accessToken,
        refreshToken: record.material.refreshToken,
        expiresAt: record.expiresAt,
        refreshTokenExpiresAt: record.material.refreshTokenExpiresAt,
        scopes: record.material.scopes,
        subscriptionType: record.material.subscriptionType,
        obtainedAt: record.updatedAt,
      };
    }
    return null;
  }

  /**
   * Provides a vault as a `CredentialStore` for managing and refreshing credentials.
   *
   * Ensures that credentials are only readable after being explicitly scoped,
   * preventing unintended exposure of sensitive information.
   *
   * On failure, throws an error if the vault cannot be accessed or if the
   * credentials do not match the expected shape.
   */
  async put(id: string, credential: ProviderCredential): Promise<void> {
    const material = credentialToMaterial(credential);
    const existing = await this.#vault.get(id);
    if (existing) {
      await this.#vault.put(
        rotateSecretRecord(existing, material, { expiresAt: credential.expiresAt, now: this.#now }),
      );
      return;
    }
    const defaults = this.#defaults(id);
    await this.#vault.put(
      createSecretRecord({
        id,
        label: defaults.label,
        purpose: defaults.purpose,
        scope: defaults.scope,
        tags: defaults.tags ?? [],
        material,
        expiresAt: credential.expiresAt,
        now: this.#now,
      }),
    );
  }

  /** delete implementation. */
  async delete(id: string): Promise<boolean> {
    const record = await this.#vault.get(id);
    if (!record || !isCredentialType(record.type)) return false;
    return this.#vault.delete(id);
  }

  /** list implementation. */
  async list(): Promise<string[]> {
    const descriptors = await this.#vault.describe();
    return descriptors
      .filter((descriptor) => isCredentialType(descriptor.type))
      .map((descriptor) => descriptor.id)
      .sort();
  }
}

/**
 * Determines the type of credential based on the provided identifier.
 * @param id - The unique identifier of the credential.
 * @returns The type of credential if the identifier is valid, otherwise throws an error.
 * @throws Will throw an error if the provided id is invalid or does not match the expected format.
 */
function isCredentialType(type: SecretType): boolean {
  return type === "api_key" || type === "oauth_token";
}

/**
 * Retrieves the material details of a credential record.
 *
 * @param id - The unique identifier of the secret record.
 * @returns The material details of the credential if the identifier is valid; otherwise, returns null.
 * @throws Will throw an error if the provided id is invalid or does not match the expected format.
 */
function credentialToMaterial(credential: ProviderCredential): SecretMaterial {
  if (credential.kind === "api_key") {
    return { type: "api_key", apiKey: credential.apiKey, header: null };
  }
  return {
    type: "oauth_token",
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
    scopes: credential.scopes,
    subscriptionType: credential.subscriptionType,
    tokenEndpoint: null,
  };
}

/** aad implementation. */
function aad(id: string, type: SecretType): Buffer {
  return Buffer.from(`${id}${AAD_SEPARATOR}${type}`, "utf8");
}

/**
 * Stores and manages credentials in the vault.
 *
 * Guarantees that credentials are stored in a `CredentialStore` format and
 * ensures they are only accessible after being explicitly scoped.
 * On failure, throws an error if the vault cannot be accessed or if the
 * credentials do not match the expected shape.
 */
function parseEnvelope(raw: string, file: string): VaultEnvelope {
  let parsed: Partial<VaultEnvelope>;
  try {
    parsed = JSON.parse(raw) as Partial<VaultEnvelope>;
  } catch {
    throw new Error(`invalid vault envelope: ${file}`);
  }
  if (
    parsed.schemaVersion !== ENVELOPE_SCHEMA_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    typeof parsed.id !== "string" ||
    typeof parsed.type !== "string" ||
    !(SECRET_TYPES as readonly string[]).includes(parsed.type) ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.authTag !== "string"
  ) {
    throw new Error(`invalid vault envelope: ${file}`);
  }
  return parsed as VaultEnvelope;
}
