import type { CredentialSource } from "../credential-source.js";
import type { Detector, Finding } from "../scan-finding.js";
import { codexAuthJson } from "./codex-auth-json.js";
import { claudeCredentialsFile, claudeKeychain } from "./claude-credentials.js";
import { grokAuthJson } from "./grok-auth-json.js";
import { geminiOauthCreds } from "./gemini-oauth-creds.js";
import { antigravityKeychain } from "./antigravity-keychain.js";
import { cursorKeychain } from "./cursor-keychain.js";
import { githubHosts } from "./github-hosts.js";
import { githubKeychain } from "./github-keychain.js";
import { agentOsSecrets } from "./agent-os-secrets.js";
import { environmentVariables } from "./environment-variables.js";
import { sshKeys } from "./ssh-keys.js";
import { macosKeychainSecrets } from "./macos-keychain-secrets.js";
import { macosKeychainInventory } from "./macos-keychain-inventory.js";
import { passwordStores } from "./password-stores.js";

/**
 * The registry. Order is the report order, and adding a source is adding an
 * entry here — no other file changes.
 */
export const DETECTORS: readonly Detector[] = [
  codexAuthJson,
  claudeCredentialsFile,
  claudeKeychain,
  grokAuthJson,
  geminiOauthCreds,
  antigravityKeychain,
  cursorKeychain,
  githubHosts,
  githubKeychain,
  agentOsSecrets,
  environmentVariables,
  sshKeys,
  macosKeychainSecrets,
  macosKeychainInventory,
  passwordStores,
];

export interface ScanOptions {
  detectors?: readonly Detector[];
  /** Restrict to named detectors or providers. Empty means everything. */
  only?: readonly string[];
  now?: () => number;
  /**
   * Opt in to releasing secret material, knowing that on macOS this can raise one
   * "allow access" dialog per keychain item. Omitted means no: a scan is an
   * unattended operation until a caller says otherwise, and the caller is the only
   * party that knows whether the owner is sitting there.
   */
  releaseSecrets?: boolean;
}

/**
 * Run every applicable detector against one machine. Read-only throughout, and
 * silent by default — without `releaseSecrets` this will not ask the owner for
 * anything, so it is safe to run from a timer, a supervisor or an agent.
 */
export async function scanSource(
  source: CredentialSource,
  options: ScanOptions = {},
): Promise<Finding[]> {
  const context = {
    now: options.now ?? (() => Date.now()),
    releaseSecrets: options.releaseSecrets === true,
  };
  const only = new Set(options.only ?? []);
  const findings: Finding[] = [];
  for (const detector of options.detectors ?? DETECTORS) {
    if (only.size > 0 && !only.has(detector.name) && !only.has(detector.provider)) continue;
    findings.push(...(await detector.detect(source, context)));
  }
  return disambiguate(findings);
}

/**
 * Two credentials on one machine can slug to the same id — `GITHUB_TOKEN.secret`
 * and `github-token` both become `agents-github-token`. Left alone, importing
 * them would silently store one on top of the other, which is the worst possible
 * outcome for a tool whose job is to stop credentials going missing. So a
 * collision gets a numeric suffix and stays visible.
 */
function disambiguate(findings: readonly Finding[]): Finding[] {
  const used = new Map<string, number>();
  return findings.map((finding) => {
    const seen = used.get(finding.suggestedId) ?? 0;
    used.set(finding.suggestedId, seen + 1);
    if (seen === 0) return finding;
    return {
      ...finding,
      suggestedId: `${finding.suggestedId}-${seen + 1}`,
      notes: [...finding.notes, `id disambiguated: another source produced ${finding.suggestedId}`],
    };
  });
}
