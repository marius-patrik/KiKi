import { createSecretRecord, SECRET_TYPES } from "../../record.js";
import {
  many,
  optional,
  required,
  VaultCliError,
  type ParsedArguments,
} from "../argument-parsing.js";
import { fingerprintsOf, materialFromInput } from "../material-from-input.js";
import { formatFingerprint } from "../fingerprint.js";
import type { VaultCliIo } from "../io.js";
import { openVault } from "../vault-location.js";
import { isSecretType, readMaterialInput, scopeFrom, warnEmptyScope } from "./shared.js";

/**
 * Adds a new command to the vault.
 *
 * @param args - The parsed command-line arguments.
 * @param io - The input/output interface for the CLI.
 * @returns A promise that resolves with the command ID or error code.
 * @throws If the secret type is unknown or the scope is empty.
 */
export async function addCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const { store } = await openVault(io);
  const id = required(args, "id");
  const typeName = required(args, "type");
  if (!isSecretType(typeName))
    throw new VaultCliError(
      `unknown secret type: ${typeName} (expected one of ${SECRET_TYPES.join(", ")})`,
    );
  const raw = await readMaterialInput(args, io);
  const material = materialFromInput(typeName, raw, {
    header: optional(args, "header"),
    username: optional(args, "username"),
    origin: optional(args, "origin"),
    loginUrl: optional(args, "login-url"),
    publicKey: optional(args, "public-key"),
    issuer: optional(args, "issuer"),
    account: optional(args, "account"),
  });
  const scope = scopeFrom(args);
  warnEmptyScope(scope, io);
  const tags = many(args, "tag");
  const account = optional(args, "account");
  if (account != null && account.length > 0) {
    // Ensure account tag is always present when --account is given
    const accountTag = `account:${account}`;
    if (!tags.includes(accountTag)) tags.push(accountTag);
  }
  const record_ = createSecretRecord({
    id,
    label: required(args, "label"),
    purpose: required(args, "purpose"),
    scope,
    material,
    expiresAt: optional(args, "expires-at"),
    tags,
    now: io.now,
  });
  await store.put(record_);
  io.out(
    `added ${record_.id} (${record_.type}) for ${record_.purpose}: ${fingerprintsOf(material).map(formatFingerprint).join(" ")}\n`,
  );
  return 0;
}
