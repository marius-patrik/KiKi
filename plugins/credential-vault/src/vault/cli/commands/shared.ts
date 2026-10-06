import { readFile as readFileFromDisk } from "node:fs/promises";
import { SECRET_TYPES, type SecretScope, type SecretType } from "../../record.js";
import { exists } from "../../files.js";
import {
  boolean,
  many,
  optional,
  VaultCliError,
  type ParsedArguments,
} from "../argument-parsing.js";
import type { VaultCliIo } from "../io.js";

export const USAGE = `vault - agent-managed credential vault

Usage:
  vault init [--passphrase] [--json]
  vault add --id <id> --type <type> --label <label> --purpose <purpose>
            (--stdin | --file <path>) [--agent <id>...] [--workspace <name>]
            [--expires-at <iso>] [--tag <tag>...] [--header <h>] [--username <u>]
            [--origin <url>] [--login-url <url>] [--public-key <text>]
            [--account <a>]
  vault import-totp --id <id> --label <label> --purpose <purpose>
            (--stdin | --file <path>) [--agent <id>...] [--issuer <i>] [--account <a>]
  vault list [--json]
  vault get --id <id> --reveal [--field <name>] [--out <path>]
  vault totp --id <id> [--json]
  vault status [--json]
  vault scan [--json] [--import] [--only <detector-or-provider>...]
             [--ssh <host> --remote-home <path> --remote-platform win32|linux|darwin]
             [--machine <name>] [--agent <id>...] [--workspace <name>]
             [--release-secrets]

Secret material is never taken from argv: --stdin or --file only.
vault scan never prompts. Keychain items it cannot read without the owner are
reported as present-but-not-read. --release-secrets opts in to opening them, and
on macOS that means one approval dialog per item another application owns: pass
it only when the owner is at the machine.
Types: ${SECRET_TYPES.join(", ")}
`;

/**
 * Determines if the given value is a SecretType.
 *
 * @param value - The string value to check against SECRET_TYPES.
 * @returns true if value is in SECRET_TYPES; otherwise, false.
 * @throws VaultCliError if value is not in SECRET_TYPES.
 */
export function isSecretType(value: string): value is SecretType {
  return (SECRET_TYPES as readonly string[]).includes(value);
}

/**
 * Reads secret material from either a file or standard input.
 *
 * @param args - The parsed command-line arguments.
 * @param io - The input/output interface for reading from standard input.
 * @returns The secret material as a string.
 * @throws VaultCliError if the file does not exist or if secret material is not provided via --stdin or --file.
 */
export async function readMaterialInput(args: ParsedArguments, io: VaultCliIo): Promise<string> {
  const file = optional(args, "file");
  if (file) {
    if (!(await exists(file))) throw new VaultCliError(`no such file: ${file}`);
    return readFileFromDisk(file, "utf8");
  }
  if (!boolean(args, "stdin"))
    throw new VaultCliError(
      "secret material must come from --stdin or --file, never from a command-line argument",
    );
  return io.readStdin();
}

/**
 * Returns a SecretScope object representing the workspace and agents based on the provided arguments.
 * @param args - The parsed command-line arguments containing optional workspace and multiple agents.
 * @returns A SecretScope object with the workspace and agents.
 * @throws If the arguments do not provide a workspace or agents.
 */
export function scopeFrom(args: ParsedArguments): SecretScope {
  return { workspace: optional(args, "workspace") ?? "*", agents: many(args, "agent") };
}

/**
 * Emits a warning if the provided SecretScope is empty, indicating no workspace or agents are defined.
 * @param scope - The SecretScope object to check for emptiness.
 * @param io - The input/output interface for logging the warning.
 * @throws Will not throw, but logs a warning if the SecretScope has no workspace or agents.
 */
export function warnEmptyScope(scope: SecretScope, io: VaultCliIo): void {
  if (scope.agents.length === 0)
    io.err("warning: no --agent given, so no agent can read this record until it is re-scoped\n");
}
