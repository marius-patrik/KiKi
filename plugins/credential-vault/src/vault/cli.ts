/**
 * The owner-facing command surface over the vault, and the scanner that seeds it
 * from credentials a machine already holds.
 *
 * `agent.ts` is the surface an *agent* gets: narrow, scoped, unable to enumerate.
 * This is the other half — the surface the *owner* gets, which is allowed to
 * enumerate, allowed to create, and allowed (once, loudly, with an explicit flag)
 * to reveal. Keeping them in separate files is the point: nothing here is
 * reachable from an agent's `VaultAgent`, so widening the owner's tools never
 * widens an agent's.
 *
 * Three rules shape every command below.
 *
 * *A secret value never arrives on argv.* `vault add` takes its material from
 * stdin or a file and has no `--value`. argv lands in shell history, in `ps`
 * output, and in any process listing the machine keeps, so an argv-carried secret
 * is leaked before the command has finished parsing it.
 *
 * *A secret value never leaves except through one door.* `vault get --reveal` is
 * the only path that prints material, and everything else — `list`, `status`,
 * `scan` — renders through `fingerprint()`, which keeps four characters and a
 * length. That is enough for an owner to recognise a credential they are looking
 * at and not enough to use it.
 *
 * *Discovery is read-only and reports by default.* `vault scan` opens files,
 * parses them, and prints an inventory; it writes nothing anywhere unless
 * `--import` is passed, and it never modifies the source. The failure it guards
 * against is a scanner that "helpfully" imports 40 stale tokens the first time it
 * is run, or rewrites a credential file it only meant to read.
 *
 * The scanner is a registry of `Detector`s over a `CredentialSource`. The source
 * abstraction is what makes "seed the vault from the machine over there" a
 * transport change rather than a second scanner: `LocalSource` reads the local
 * filesystem and the macOS keychain, `SshSource` runs the same reads over `ssh`,
 * and every detector is written against the interface, not against `node:fs`.
 *
 * This file is the public entry point only. The implementation is split by
 * concern under `./cli/` — argument parsing, vault location, material
 * construction, credential sources, one file per detector, import, reporting,
 * and the individual commands — so that no single file bundles more than one
 * cohesive piece of the surface.
 */

import { descriptorOf, effectiveExpiryMs } from "./record.js";

export type { VaultCliIo } from "./cli/io.js";
export { defaultVaultCliIo } from "./cli/io.js";

export type { ParsedArguments } from "./cli/argument-parsing.js";
export { parseVaultArguments, VaultCliError } from "./cli/argument-parsing.js";

export type { Fingerprint } from "./cli/fingerprint.js";
export { fingerprint, formatFingerprint } from "./cli/fingerprint.js";

export type { MasterKeyKind, VaultConfig, OpenedVault } from "./cli/vault-location.js";
export { resolveVaultDirectory, vaultConfigFile, openVault } from "./cli/vault-location.js";

export type { MaterialOptions } from "./cli/material-from-input.js";
export {
  materialFromInput,
  totpParametersFromInput,
  revealField,
  fingerprintsOf,
} from "./cli/material-from-input.js";

export type { KeychainItem, CredentialSource, SourcePlatform } from "./cli/credential-source.js";
export {
  joinSource,
  KEYCHAIN_ENUMERATION_ARGV,
  KEYCHAIN_RELEASE_FLAGS,
  parseKeychainDump,
  decodeKeychainPayload,
} from "./cli/credential-source.js";
export { LocalSource } from "./cli/local-credential-source.js";
export { SshSource, type SshSourceOptions } from "./cli/ssh-credential-source.js";
export { MemorySource } from "./cli/memory-credential-source.js";

export type {
  CredentialPlan,
  CredentialOrigin,
  Finding,
  RedactedFinding,
  ScanContext,
  Detector,
} from "./cli/scan-finding.js";
export { redactFinding, slugify, jwtClaims } from "./cli/scan-finding.js";

export type { GitHubHostEntry } from "../file-providers.js";
export { parseGitHubHosts } from "../file-providers.js";

export { sshKeyPassphraseState, sshPublicKeyFingerprint } from "./cli/detectors/ssh-keys.js";

export { DETECTORS } from "./cli/detectors/registry.js";
export type { ScanOptions } from "./cli/detectors/registry.js";
export { scanSource } from "./cli/detectors/registry.js";

export type { ImportOptions, ImportOutcome } from "./cli/credential-import.js";
export { provenanceTags, importFindings } from "./cli/credential-import.js";

export { renderScanReport } from "./cli/scan-report.js";

export { vaultCommand } from "./cli/dispatch.js";

/** Re-exported so a caller wiring this in needs one import, not three. */
export { descriptorOf, effectiveExpiryMs };

// Standalone entry. The `dsh` launcher also routes the `accounts` verb here
// (see the plugin bin), so this guard is only for running `node lib/vault/cli.js`.
import { vaultCommand as runVaultCommand } from "./cli/dispatch.js";

const runningEntry =
  typeof process !== "undefined" && process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (runningEntry.endsWith("/cli.js") || runningEntry.endsWith("/cli.ts")) {
  runVaultCommand(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
