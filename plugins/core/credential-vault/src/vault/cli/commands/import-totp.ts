import { createSecretRecord } from "../../record.js";
import { generateTotp } from "../../totp.js";
import { many, optional, required, type ParsedArguments } from "../argument-parsing.js";
import { totpParametersFromInput } from "../material-from-input.js";
import type { VaultCliIo } from "../io.js";
import { openVault } from "../vault-location.js";
import { readMaterialInput, scopeFrom, warnEmptyScope } from "./shared.js";

/** importTotpCommand implementation. */
export async function importTotpCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const { store } = await openVault(io);
  const raw = await readMaterialInput(args, io);
  const parameters = totpParametersFromInput(raw, {
    issuer: optional(args, "issuer"),
    account: optional(args, "account"),
  });
  const scope = scopeFrom(args);
  warnEmptyScope(scope, io);
  const record_ = createSecretRecord({
    id: required(args, "id"),
    label: optional(args, "label") ?? `${parameters.issuer ?? "totp"} second factor`,
    purpose: required(args, "purpose"),
    scope,
    material: { type: "totp_seed", parameters },
    tags: many(args, "tag"),
    now: io.now,
  });
  await store.put(record_);
  const code = generateTotp(parameters, io.now());
  io.out(
    `imported ${record_.id} (totp_seed) for ${record_.purpose}: issuer=${parameters.issuer ?? "-"} account=${parameters.account ?? "-"} ` +
      `${parameters.algorithm}/${parameters.digits} digits/${parameters.period}s; a code is generating now (${Math.round(code.remainingMs / 1000)}s left in this step)\n`,
  );
  return 0;
}
