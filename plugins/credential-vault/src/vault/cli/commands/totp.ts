import { generateTotp } from "../../totp.js";
import { boolean, required, VaultCliError, type ParsedArguments } from "../argument-parsing.js";
import type { VaultCliIo } from "../io.js";
import { openVault } from "../vault-location.js";

/**
 * Displays the Time-based One-Time Password (TOTP) code for a given record.
 *
 * Guarantees:
 * - Outputs the TOTP code and its remaining validity period if not in JSON format.
 * - Returns a JSON object containing the TOTP code, valid until timestamp, and remaining seconds if the `--json` flag is used.
 * - Throws an error if the specified record is not a TOTP seed or does not exist.
 */
// jscpd:ignore-start -- mirrors vault/cli/commands/get.ts's small option-parsing shape for a different subcommand
export async function totpCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const id = required(args, "id");
  const { store } = await openVault(io);
  const record_ = await store.get(id);
  if (!record_) throw new VaultCliError(`no such record: ${id}`);
  if (record_.material.type !== "totp_seed")
    // jscpd:ignore-end
    throw new VaultCliError(`${id} is a ${record_.type}, not a totp_seed`);
  const code = generateTotp(record_.material.parameters, io.now());
  if (boolean(args, "json")) {
    io.out(
      `${JSON.stringify({ id, code: code.code, validUntil: new Date(code.validUntilMs).toISOString(), remainingSeconds: Math.round(code.remainingMs / 1000) })}\n`,
    );
    return 0;
  }
  io.out(`${code.code}  (${Math.round(code.remainingMs / 1000)}s remaining)\n`);
  return 0;
}
