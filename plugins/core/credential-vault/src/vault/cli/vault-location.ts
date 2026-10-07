import path from "node:path";
import { readFile as readFileFromDisk } from "node:fs/promises";
import { SecretValue } from "../secret.js";
import { EncryptedFileVault, vaultDirectory } from "../store.js";
import { KeyFileMasterKey, PassphraseMasterKey, type MasterKeySource } from "../masterkey.js";
import { exists } from "../files.js";
import { VaultCliError } from "./argument-parsing.js";
import type { VaultCliIo } from "./io.js";

const CONFIG_FILE = "vault.json";
const CONFIG_SCHEMA_VERSION = 1;

export type MasterKeyKind = "key-file" | "passphrase";

export interface VaultConfig {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  masterKey: MasterKeyKind;
  createdAt: string;
}

/**
 * Where the vault lives, given the environment. Mirrors how `src/cli/state.ts`
 * resolves the state root without importing it: `src/engine` takes its authority
 * by injection and does not depend on the CLI layer, so the precedence is
 * restated here rather than shared.
 */
export function resolveVaultDirectory(
  env: Record<string, string | undefined>,
  home: string,
): string {
  const explicit = env.ANDROMEDA_VAULT_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const secrets = env.ANDROMEDA_SECRETS?.trim();
  if (secrets) return vaultDirectory(path.resolve(secrets));
  const agentsHome = env.ANDROMEDA_HOME?.trim();
  if (agentsHome) return vaultDirectory(path.join(path.resolve(agentsHome), "secrets"));
  if (!home) throw new VaultCliError("cannot locate a home directory; set ANDROMEDA_VAULT_DIR");
  return vaultDirectory(path.join(home, ".agents", "secrets"));
}

/**
 * Reads the vault configuration file from the specified directory.
 *
 * @param directory - The directory where the vault configuration file is located.
 * @returns The parsed VaultConfig object if valid, or null if the file does not exist or is malformed.
 * @throws VaultCliError if the configuration file is missing, malformed, or has an unsupported schema version or master key.
 */
export function vaultConfigFile(directory: string): string {
  return path.join(directory, CONFIG_FILE);
}

/**
 * Reads the vault configuration from the specified directory.
 *
 * @param directory - The directory where the vault configuration file is located.
 * @returns The parsed VaultConfig object if valid, or null if the file does not exist or is malformed.
 * @throws VaultCliError if the configuration file is missing, malformed, or has an unsupported schema version or master key.
 */
export async function readVaultConfig(directory: string): Promise<VaultConfig | null> {
  const file = vaultConfigFile(directory);
  if (!(await exists(file))) return null;
  let parsed: Partial<VaultConfig>;
  try {
    parsed = JSON.parse(await readFileFromDisk(file, "utf8")) as Partial<VaultConfig>;
  } catch {
    throw new VaultCliError(`vault configuration is malformed: ${file}`);
  }
  if (
    parsed.schemaVersion !== CONFIG_SCHEMA_VERSION ||
    (parsed.masterKey !== "key-file" && parsed.masterKey !== "passphrase")
  ) {
    throw new VaultCliError(`vault configuration is malformed: ${file}`);
  }
  return parsed as VaultConfig;
}

/**
 * The passphrase is read from the environment rather than prompted. A vault the
 * re-auth supervisor maintains has to be openable by an unattended process, and a
 * prompt in this path would be the exact thing the whole component exists to
 * remove. `KeyFileMasterKey` remains the default for that reason.
 */
export function masterKeyFor(
  kind: MasterKeyKind,
  directory: string,
  io: VaultCliIo,
): MasterKeySource {
  if (kind === "key-file") return new KeyFileMasterKey({ directory });
  const passphrase = io.env.ANDROMEDA_VAULT_PASSPHRASE?.trim();
  if (!passphrase)
    throw new VaultCliError("this vault is passphrase-protected; set ANDROMEDA_VAULT_PASSPHRASE");
  return new PassphraseMasterKey({ directory, passphrase: new SecretValue(passphrase) });
}

export interface OpenedVault {
  directory: string;
  config: VaultConfig;
  store: EncryptedFileVault;
}

/**
 * Opens the vault using the provided environment settings for security.
 *
 * Guarantees an `OpenedVault` object if the vault is successfully opened.
 * Throws a `VaultCliError` if the vault is passphrase-protected and no passphrase is provided.
 *
 * @param io - The input/output interface for interacting with the vault.
 */
export async function openVault(io: VaultCliIo): Promise<OpenedVault> {
  const directory = resolveVaultDirectory(io.env, io.home);
  const config = await readVaultConfig(directory);
  if (!config) throw new VaultCliError(`no vault at ${directory}; run \`vault init\` first`);
  return {
    directory,
    config,
    store: new EncryptedFileVault({
      directory,
      masterKey: masterKeyFor(config.masterKey, directory, io),
    }),
  };
}
