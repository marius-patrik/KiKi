import {
  boolean,
  many,
  optional,
  VaultCliError,
  type ParsedArguments,
} from "../argument-parsing.js";
import type { VaultCliIo } from "../io.js";
import { openVault } from "../vault-location.js";
import { LocalSource } from "../local-credential-source.js";
import { SshSource } from "../ssh-credential-source.js";
import type { CredentialSource, SourcePlatform } from "../credential-source.js";
import { scanSource } from "../detectors/registry.js";
import { importFindings } from "../credential-import.js";
import { KEYCHAIN_WITHHELD_NOTE } from "../keychain-consent-gate.js";
import { redactFinding } from "../scan-finding.js";
import { formatFingerprint } from "../fingerprint.js";
import { renderScanReport, table } from "../scan-report.js";
import { scopeFrom, warnEmptyScope } from "./shared.js";

/**
 * Returns a `CredentialSource` based on the provided arguments.
 *
 * Guarantees a `LocalSource` if `ssh` is not provided. Throws a `VaultCliError` if `ssh` is provided
 * but `remote-home` is missing or `--remote-platform` is not one of `win32`, `linux`, or `darwin`.
 *
 * @param args - The parsed command-line arguments.
 * @param io - The input/output configuration.
 * @returns A `CredentialSource` instance.
 */
function sourceFromArguments(args: ParsedArguments, io: VaultCliIo): CredentialSource {
  const host = optional(args, "ssh");
  if (!host) {
    return new LocalSource({
      machine: optional(args, "machine") ?? "local",
      home: io.home,
      env: io.env,
    });
  }
  const platformName = optional(args, "remote-platform") ?? "linux";
  if (platformName !== "win32" && platformName !== "linux" && platformName !== "darwin") {
    throw new VaultCliError(
      `--remote-platform must be win32, linux or darwin, got ${platformName}`,
    );
  }
  const home = optional(args, "remote-home");
  if (!home)
    throw new VaultCliError(
      "--ssh requires --remote-home, the credential owner's home directory on that machine",
    );
  return new SshSource({
    host,
    home,
    platform: platformName as SourcePlatform,
    machine: optional(args, "machine") ?? host,
  });
}

/**
 * Scans the command arguments to determine the source configuration for SSH access.
 *
 * Guarantees:
 * - Returns a `SshSource` instance configured with host, home directory, platform, and machine.
 * - Throws `VaultCliError` if the platform is not recognized or if `--remote-home` is missing.
 *
 * Failure Path:
 * - Throws `VaultCliError` for unrecognized platforms or missing required arguments.
 */
export async function scanCommand(args: ParsedArguments, io: VaultCliIo): Promise<number> {
  const source = sourceFromArguments(args, io);
  // The one place a human can consent to being prompted. It is a flag rather than
  // a heuristic on purpose: "is a TTY attached" and "is the owner looking at this
  // screen" are different questions, and every agent in this system runs attached
  // to something that looks like a terminal.
  const releaseSecrets = boolean(args, "release-secrets");
  if (releaseSecrets) {
    io.err(
      "--release-secrets: macOS will ask you to approve each keychain item another application owns. Expect one dialog per item.\n",
    );
  }
  const findings = await scanSource(source, {
    only: many(args, "only"),
    now: io.now,
    releaseSecrets,
  });
  const nowMs = io.now();
  const wantsImport = boolean(args, "import");

  if (!wantsImport) {
    if (boolean(args, "json"))
      io.out(
        `${JSON.stringify({ machine: source.machine, scannedAt: new Date(nowMs).toISOString(), findings: findings.map((finding) => redactFinding(finding, nowMs)) }, null, 2)}\n`,
      );
    else io.out(renderScanReport(findings, nowMs));
    const withheld = findings.filter((finding) =>
      finding.notes.includes(KEYCHAIN_WITHHELD_NOTE),
    ).length;
    io.err(
      `report only: pass --import to bring ${findings.filter((finding) => finding.material).length} readable credentials into the vault\n` +
        (withheld > 0 && !releaseSecrets
          ? `${withheld} keychain item(s) found but not read; re-run with --release-secrets, with the owner present, to open them\n`
          : ""),
    );
    return 0;
  }

  const { store } = await openVault(io);
  const scope = scopeFrom(args);
  warnEmptyScope(scope, io);
  const outcomes = await importFindings(store, findings, {
    scope,
    now: io.now,
    skipExisting: boolean(args, "skip-existing"),
  });
  if (boolean(args, "json")) {
    io.out(
      `${JSON.stringify({ machine: source.machine, importedAt: new Date(nowMs).toISOString(), outcomes }, null, 2)}\n`,
    );
    return 0;
  }
  const rows: string[][] = [["RESULT", "ID", "PROVIDER", "TYPE", "ACCOUNT", "EXPIRY", "DETAIL"]];
  for (const outcome of outcomes) {
    rows.push([
      outcome.kind,
      outcome.id,
      outcome.finding.provider,
      outcome.finding.type,
      outcome.finding.account ?? "-",
      outcome.finding.expiresAt
        ? `${outcome.finding.expiresAt}${outcome.finding.expired ? " EXPIRED" : ""}`
        : "-",
      outcome.kind === "skipped"
        ? outcome.reason
        : outcome.finding.fingerprints.map(formatFingerprint).join(" "),
    ]);
  }
  io.out(`${table(rows)}\n`);
  return 0;
}
