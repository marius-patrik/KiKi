/**
 * Agent-managed credential vault.
 *
 * The goal, in the owner's words, is that a login screen is never handed back to
 * a human: the vault holds every kind of credential, the supervisor keeps them
 * alive, and agents get what they need through one scoped, audited interface.
 *
 * Five layers, kept separate for the same reason the provider engine keeps its
 * three separate — conflating them is the failure mode:
 *
 * - `record` says what a secret *is*, who may read it, and when it dies.
 * - `masterkey` says where the encryption key comes from, and is the seam an OS
 *   keychain or OpenBao slots into.
 * - `store` says how records are persisted, and presents the vault as the
 *   `CredentialStore` the provider harness already speaks.
 * - `totp` generates second factors, so MFA is a lookup rather than a human.
 * - `supervisor` keeps credentials fresh and, when it cannot, says exactly what
 *   is needed and whether a person has to be there.
 * - `tools` is the surface an agent is actually given: capabilities that *use* a
 *   credential and return only the outcome.
 * - `agent` is the privileged in-process custody API, for callers that are not
 *   agents. It is not what you hand to a model.
 *
 * The split between the last two is the load-bearing one. An LLM-driven agent
 * that receives secret material has already leaked it — into a prompt, a
 * transcript, a log, a tool argument, an outbound request — so the vault stops
 * answering "what is the credential?" and answers "here is the result of using
 * it" instead. `VaultToolset` performs the authenticated action itself, checks
 * the destination against a host allow-list derived from the provider
 * descriptor, and returns types that cannot structurally carry material.
 *
 * This slice deliberately stops short of browser-driven login and the WebAuthn
 * signing ceremony. The `passkey` and `cookie_jar` record types and the
 * `ReauthStrategy` enum are shaped so those land as new behaviour rather than a
 * storage or reporting migration, and until they do, the health view reports
 * those strategies as not automated rather than as covered.
 *
 * Ported from Andromeda `src/vault/index.ts`. The supervisor, tools, and agent
 * layers land in later phases of the port; until then `SecretValue` is
 * re-exported from `./secret.js`, the provider harness surface this plugin owns.
 */

export * from "./record.js";
export * from "./masterkey.js";
export * from "./store.js";
export * from "./totp.js";
export * from "./files.js";
export * from "./secret.js";
export * from "./redirects.js";
export * from "./descriptor.js";
export * from "./oauth.js";
export * from "./provider-descriptor.js";
export * from "./supervisor.js";
export * from "./agent.js";
export * from "./tools.js";
export {
  defaultVaultCliIo,
  parseVaultArguments,
  VaultCliError,
  fingerprint,
  formatFingerprint,
  resolveVaultDirectory,
  vaultConfigFile,
  openVault,
  materialFromInput,
  totpParametersFromInput,
  revealField,
  fingerprintsOf,
  joinSource,
  LocalSource,
  SshSource,
  MemorySource,
  parseKeychainDump,
  decodeKeychainPayload,
  redactFinding,
  slugify,
  jwtClaims,
  parseGitHubHosts,
  type GitHubHostEntry,
  sshKeyPassphraseState,
  sshPublicKeyFingerprint,
  DETECTORS,
  scanSource,
  provenanceTags,
  importFindings,
  renderScanReport,
  vaultCommand,
} from "./cli.js";
export type {
  VaultCliIo,
  ParsedArguments,
  Fingerprint,
  MasterKeyKind,
  VaultConfig,
  OpenedVault,
  MaterialOptions,
  SourcePlatform,
  KeychainItem,
  CredentialSource,
  SshSourceOptions,
  CredentialPlan,
  CredentialOrigin,
  Finding,
  RedactedFinding,
  ScanContext,
  Detector,
  ScanOptions,
  ImportOptions,
  ImportOutcome,
} from "./cli.js";
