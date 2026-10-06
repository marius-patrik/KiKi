import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource, type CredentialSource } from "../credential-source.js";
import { stringField, fingerprintsOf } from "../material-from-input.js";
import { readKeychainItem, withheldKeychainFinding } from "../keychain-consent-gate.js";
import {
  isoFromMilliseconds,
  origin,
  parseJson,
  record,
  slugify,
  type CredentialOrigin,
  type Detector,
  type Finding,
  type ScanContext,
} from "../scan-finding.js";

const ANTHROPIC_TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";

/** The `claudeAiOauth` document, wherever it is stored. Shared by file and keychain. */
function claudeOauthFinding(
  detector: string,
  source: CredentialSource,
  context: ScanContext,
  kind: CredentialOrigin["kind"],
  location: string,
  document: Record<string, unknown>,
  suffix: string | null,
): Finding | null {
  const oauth = record(document.claudeAiOauth);
  const accessToken = oauth ? stringField(oauth, "accessToken") : null;
  if (!oauth || !accessToken) return null;
  const refreshToken = stringField(oauth, "refreshToken");
  const subscriptionType = stringField(oauth, "subscriptionType");
  const material: SecretMaterial = {
    type: "oauth_token",
    accessToken: new SecretValue(accessToken),
    refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
    refreshTokenExpiresAt: isoFromMilliseconds(oauth.refreshTokenExpiresAt),
    scopes: Array.isArray(oauth.scopes)
      ? oauth.scopes.filter((entry): entry is string => typeof entry === "string")
      : [],
    subscriptionType,
    tokenEndpoint: ANTHROPIC_TOKEN_ENDPOINT,
  };
  return {
    detector,
    provider: "anthropic",
    type: "oauth_token",
    suggestedId: slugify("anthropic", "claude-code", suffix, source.machine),
    label: `Anthropic Claude Code login (${subscriptionType ?? "unknown plan"}) on ${source.machine}`,
    purpose: suffix ? `anthropic/claude-code-${slugify(suffix)}` : "anthropic/claude-code",
    account: stringField(document, "organizationUuid"),
    expiresAt: isoFromMilliseconds(oauth.expiresAt),
    plan: "subscription",
    origin: origin(source, kind, location, context),
    fingerprints: fingerprintsOf(material),
    notes: [
      ...(material.type === "oauth_token" && material.refreshTokenExpiresAt
        ? [`refresh token expires ${material.refreshTokenExpiresAt}`]
        : []),
      ...(refreshToken ? [] : ["no refresh token: this login cannot self-heal"]),
    ],
    material,
  };
}

/** `~/.claude/.credentials.json`, which is where Claude Code stores outside macOS. */
export const claudeCredentialsFile: Detector = {
  name: "claude-credentials-file",
  provider: "anthropic",
  /**
   * Detects the presence of a specific credential file or keychain items for the
   * Anthropic provider. Returns an array containing the credential finding if
   * detected, or an empty array if nothing is found.
   *
   * @param source - The source providing the home directory or keychain access.
   * @param context - Additional context for the detection process.
   * @returns An array of credential findings or an empty array.
   */
  async detect(source, context) {
    const file = joinSource(source.home, ".claude/.credentials.json");
    const document = parseJson(await source.readFile(file));
    if (!document) return [];
    const finding = claudeOauthFinding(this.name, source, context, "file", file, document, null);
    return finding ? [finding] : [];
  },
};

/**
 * macOS keeps Claude Code's login in the keychain, one item per profile, with a
 * hash suffix on the service name. Every item is walked because the suffixed
 * ones are previous logins the owner may still want — and, as it turns out, the
 * ones most likely to be long dead.
 */
export const claudeKeychain: Detector = {
  name: "claude-keychain",
  // jscpd:ignore-start -- mirrors detectors/github-keychain.ts's small detector shape for a different credential source
  provider: "anthropic",
  /**
   * Detects whether the user has logged into the "Claude Code" app using macOS Keychain.
   *
   * @param source - The source providing keychain access.
   * @param context - The context for the detection process.
   * @returns An array of findings indicating the presence or absence of "Claude Code" login items.
   * If the platform is not macOS, returns an empty array.
   * If a login item is withheld, it is not included in the findings.
   */
  async detect(source, context) {
    if (source.platform !== "darwin") return [];
    const services = (await source.keychainItems())
      .map((item) => item.service)
      .filter((service) => /^Claude Code-credentials/.test(service));
    // jscpd:ignore-end
    const findings: Finding[] = [];
    for (const service of [...new Set(services)].sort()) {
      const suffix = service.slice("Claude Code-credentials".length).replace(/^-/, "") || null;
      const read = await readKeychainItem(source, context, service, null);
      if (read.state === "absent") continue;
      if (read.state === "withheld") {
        findings.push(
          withheldKeychainFinding({
            detector: this.name,
            provider: "anthropic",
            source,
            context,
            suggestedId: slugify("anthropic", "claude-code", suffix, source.machine),
            label: `Anthropic Claude Code login in the keychain${suffix ? ` (${suffix})` : ""} on ${source.machine}`,
            purpose: suffix ? `anthropic/claude-code-${slugify(suffix)}` : "anthropic/claude-code",
            service,
            account: null,
          }),
        );
        continue;
      }
      const document = parseJson(read.value);
      if (!document) continue;
      const finding = claudeOauthFinding(
        this.name,
        source,
        context,
        "keychain",
        service,
        document,
        suffix,
      );
      if (finding) findings.push(finding);
    }
    return findings;
  },
};
