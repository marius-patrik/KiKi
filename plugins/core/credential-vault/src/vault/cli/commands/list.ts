import { ReauthSupervisor, type CredentialHealth } from "../../supervisor.js";
import type { VaultStore } from "../../store.js";
import { boolean, type ParsedArguments } from "../argument-parsing.js";
import type { VaultCliIo } from "../io.js";
import { openVault } from "../vault-location.js";
import { table } from "../scan-report.js";

/** healthById implementation. */
export async function healthById(
  store: VaultStore,
  io: VaultCliIo,
): Promise<Map<string, CredentialHealth>> {
  const supervisor = new ReauthSupervisor({ vault: store, now: io.now });
  const health = await supervisor.health();
  return new Map(health.map((entry) => [entry.id, entry]));
}

/**
 * Lists the records in the vault directory.
 *
 * Returns 0 if successful, or 1 if no records are found or JSON output is requested.
 *
 * @param args - The parsed command-line arguments.
 * @param io - The input/output interface for the command.
 * @returns A number indicating success (0) or failure (1).
 */
export async function listCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const { store, directory } = await openVault(io);
  const descriptors = await store.describe();
  const health = await healthById(store, io);
  if (boolean(args, "json")) {
    io.out(
      `${JSON.stringify({ directory, records: descriptors.map((descriptor) => ({ ...descriptor, health: health.get(descriptor.id)?.state ?? "unknown" })) }, null, 2)}\n`,
    );
    return 0;
  }
  if (descriptors.length === 0) {
    io.out(`no records in ${directory}\n`);
    return 0;
  }
  const rows: string[][] = [["ID", "TYPE", "ACCOUNT", "LABEL", "PURPOSE", "EXPIRES", "HEALTH"]];
  for (const descriptor of descriptors) {
    const entry = health.get(descriptor.id);
    const accountTag = descriptor.tags?.find((t: string) => t.startsWith("account:"));
    const account = accountTag ? accountTag.slice("account:".length) : "-";
    rows.push([
      descriptor.id,
      descriptor.type,
      account,
      descriptor.label,
      descriptor.purpose,
      entry?.expiresAt ?? descriptor.expiresAt ?? "-",
      entry?.state ?? "unknown",
    ]);
  }
  io.out(`${table(rows)}\n`);
  return 0;
}
