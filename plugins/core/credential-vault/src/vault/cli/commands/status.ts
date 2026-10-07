import { ReauthSupervisor } from "../../supervisor.js";
import { boolean, type ParsedArguments } from "../argument-parsing.js";
import type { VaultCliIo } from "../io.js";
import { openVault } from "../vault-location.js";
import { table } from "../scan-report.js";

/**
 * Checks the health of the vault and outputs the status.
 *
 * Returns 0 if the vault is healthy or if there are no records.
 * Outputs JSON or a summary of vault health and returns 0 otherwise.
 * Returns a non-zero code if an error occurs during health check.
 */
export async function statusCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const { store, directory, config } = await openVault(io);
  const supervisor = new ReauthSupervisor({ vault: store, now: io.now });
  const health = await supervisor.health();
  if (boolean(args, "json")) {
    io.out(
      `${JSON.stringify({ directory, masterKey: config.masterKey, checkedAt: new Date(io.now()).toISOString(), health }, null, 2)}\n`,
    );
    return 0;
  }
  if (health.length === 0) {
    io.out(`no records in ${directory}\n`);
    return 0;
  }
  const rows: string[][] = [
    ["ID", "PURPOSE", "STATE", "EXPIRES", "NEXT REFRESH", "SELF-HEALING", "STRATEGY"],
  ];
  for (const entry of health) {
    rows.push([
      entry.id,
      entry.purpose,
      entry.state,
      entry.expiresAt ?? "-",
      entry.nextRefreshAt ?? "-",
      entry.selfHealing ? "yes" : "no",
      entry.strategy,
    ]);
  }
  const needsOwner = health.filter(
    (entry) =>
      entry.humanPresenceRequired && entry.state !== "healthy" && entry.state !== "no_expiry",
  );
  const summary =
    `\n${health.filter((entry) => entry.selfHealing).length} of ${health.length} can renew themselves; ` +
    `${health.filter((entry) => entry.state === "expired").length} expired; ` +
    `${needsOwner.length} will need you.\n` +
    (needsOwner.length > 0
      ? `${needsOwner.map((entry) => `  ${entry.id}: ${entry.strategy}`).join("\n")}\n`
      : "");
  io.out(`${table(rows)}\n${summary}`);
  return 0;
}
