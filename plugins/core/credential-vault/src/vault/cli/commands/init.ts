import { boolean, VaultCliError, type ParsedArguments } from "../argument-parsing.js";
import type { VaultCliIo } from "../io.js";
import {
  masterKeyFor,
  readVaultConfig,
  resolveVaultDirectory,
  vaultConfigFile,
  type MasterKeyKind,
  type VaultConfig,
} from "../vault-location.js";
import { writePrivateFile } from "../../files.js";

const CONFIG_SCHEMA_VERSION = 1 as const;

/**
 * Initializes a new Vault directory with a configuration and master key.
 *
 * @param args - The parsed command-line arguments.
 * @param io - The input/output interface for the CLI.
 * @returns 0 if successful, or an error code if a vault already exists.
 * @throws If a vault already exists at the specified directory.
 */
export async function initCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const directory = resolveVaultDirectory(io.env, io.home);
  if (await readVaultConfig(directory))
    throw new VaultCliError(`a vault already exists at ${directory}`);
  const masterKey: MasterKeyKind = boolean(args, "passphrase") ? "passphrase" : "key-file";
  const config: VaultConfig = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    masterKey,
    createdAt: new Date(io.now()).toISOString(),
  };
  await writePrivateFile(vaultConfigFile(directory), `${JSON.stringify(config, null, 2)}\n`);
  // Forces the key source to mint its material now, so a misconfigured
  // passphrase fails at init rather than at the first write.
  const source = masterKeyFor(masterKey, directory, io);
  await source.key();
  if (boolean(args, "json"))
    io.out(`${JSON.stringify({ directory, masterKey, keySource: source.description })}\n`);
  else io.out(`vault initialised at ${directory}\nmaster key: ${source.description}\n`);
  return 0;
}
