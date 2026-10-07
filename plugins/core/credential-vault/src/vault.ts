/**
 * The account vault: an encrypted-at-rest document holding provider secret
 * values under their canonical reference names. The key is a 32-byte random
 * value stored in the macOS Keychain (generic-password `dsh.accounts`), with
 * a 0600 key file fallback so the vault works on non-Keychain machines too.
 *
 * The document (`$DSH_HOME/accounts.vault`) is AES-256-GCM. Every value is
 * independently nonce'd; writes rewrite the whole document atomically at
 * 0600, and a corrupt or unreadable document reads as empty rather than
 * crashing the service.
 * @module credentials/vault
 */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = "dsh.accounts";
const KEYCHAIN_ACCOUNT = "dsh";
const VAULT_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** One encrypted entry: the IV and the ciphertext-with-appended-GCM-tag. */
interface StoredEntry {
  v: string;
  c: string;
}

interface StoredVault {
  version: number;
  entries: Record<string, StoredEntry>;
}

/** emptyVault implementation. */
function emptyVault(): StoredVault {
  return { version: VAULT_VERSION, entries: {} };
}

/**
 * Attempts to read a key from the macOS keychain.
 * Returns the key as a Buffer if found, or undefined if not found or an error occurs.
 */
async function readKeyChain(): Promise<Buffer | undefined> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_ACCOUNT,
      "-w",
    ]);
    const hex = stdout.trim();
    return hex.length > 0 ? Buffer.from(hex, "hex") : undefined;
  } catch {
    return undefined;
  }
}

/** writeKeyChain implementation. */
async function writeKeyChain(key: Buffer): Promise<void> {
  await execFileAsync("security", [
    "add-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
    key.toString("hex"),
  ]);
}

/**
 * Attempts to read the key from the specified file.
 * If the file exists and contains a valid hexadecimal string, returns the key as a Buffer.
 * If the file does not exist or contains invalid data, returns undefined.
 *
 * @param keyFile - The path to the file containing the key.
 * @returns The key as a Buffer or undefined if the file is invalid or missing.
 */
async function readKeyFile(keyFile: string): Promise<Buffer | undefined> {
  try {
    const hex = (await fs.readFile(keyFile, "utf8")).trim();
    return hex.length > 0 ? Buffer.from(hex, "hex") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Load the vault key, creating it on first use: a fresh random key is
 * persisted to the Keychain when possible and always to the key file, so
 * either source alone can recover it later.
 */
export async function loadOrCreateKey(keyFile: string): Promise<Buffer> {
  const fromKeychain = await readKeyChain();
  if (fromKeychain !== undefined && fromKeychain.byteLength === KEY_BYTES) return fromKeychain;
  const fromFile = await readKeyFile(keyFile);
  if (fromFile !== undefined && fromFile.byteLength === KEY_BYTES) return fromFile;
  const key = randomBytes(KEY_BYTES);
  await fs.mkdir(dirname(keyFile), { recursive: true });
  await fs.writeFile(keyFile, `${key.toString("hex")}\n`, { mode: 0o600 });
  try {
    await writeKeyChain(key);
  } catch {
    // Keychain unavailable (non-macOS or headless): the key file is the store.
  }
  return key;
}

/** encrypt implementation. */
function encrypt(key: Buffer, value: string): StoredEntry {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { v: iv.toString("base64"), c: ciphertext.toString("base64") };
}

/** decrypt implementation. */
function decrypt(key: Buffer, entry: StoredEntry): string {
  const iv = Buffer.from(entry.v, "base64");
  const payload = Buffer.from(entry.c, "base64");
  if (payload.byteLength < TAG_BYTES) throw new Error("credentials: vault entry is truncated");
  const tag = payload.subarray(payload.byteLength - TAG_BYTES);
  const ciphertext = payload.subarray(0, payload.byteLength - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * The encrypted key-value document. All reads and writes are async and
 * serialized per operation; concurrent writers are not coordinated (the vault
 * is written by one process at a time in practice).
 */
export class Vault {
  /** Constructs an instance. */
  constructor(
    readonly filePath: string,
    readonly keyFile: string,
  ) {}

  /** load implementation. */
  private async load(): Promise<StoredVault> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as StoredVault).version === VAULT_VERSION &&
        typeof (parsed as StoredVault).entries === "object"
      ) {
        return parsed as StoredVault;
      }
    } catch {
      // Missing, corrupt, or unreadable: serve an empty vault.
    }
    return emptyVault();
  }

  /**
   * Saves the provided StoredVault to the file path, creating necessary directories and handling errors by not saving anything.
   * @param stored - The StoredVault instance to save.
   */
  private async save(stored: StoredVault): Promise<void> {
    const serialized = JSON.stringify(stored);
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    await fs.writeFile(temp, serialized, { mode: 0o600 });
    await fs.rename(temp, this.filePath);
  }

  /**
   * Retrieves the decrypted entry for the given reference from the stored vault.
   * @param ref - The reference string of the entry to retrieve.
   * @returns The decrypted entry string if found, otherwise undefined.
   * If the entry is not found or decryption fails, returns undefined.
   */
  async get(ref: string): Promise<string | undefined> {
    const entry = (await this.load()).entries[ref];
    if (entry === undefined) return undefined;
    const key = await loadOrCreateKey(this.keyFile);
    try {
      return decrypt(key, entry);
    } catch {
      // A bad key or corrupted entry for one ref should not take the whole
      // seam down; treat it as unconfigured.
      return undefined;
    }
  }

  /** set implementation. */
  async set(ref: string, value: string): Promise<void> {
    if (value.length === 0)
      throw new Error(`credentials: refusing to store an empty value for ${ref}`);
    const key = await loadOrCreateKey(this.keyFile);
    const stored = await this.load();
    stored.entries[ref] = encrypt(key, value);
    await this.save(stored);
  }

  /**
   * Sets the encrypted value for the given reference in the stored vault.
   * @param ref - The reference string of the entry to set.
   * @param value - The string value to encrypt and store.
   * @returns Resolves when the value is successfully stored, rejects if the value is empty or encryption fails.
   * If the value is empty or encryption fails, throws an error.
   */
  async unset(ref: string): Promise<void> {
    const stored = await this.load();
    if (!(ref in stored.entries)) return;
    delete stored.entries[ref];
    await this.save(stored);
  }

  /** list implementation. */
  async list(): Promise<string[]> {
    return Object.keys((await this.load()).entries).sort();
  }
}
