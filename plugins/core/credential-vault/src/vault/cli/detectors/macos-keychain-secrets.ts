import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { fingerprintsOf, stringField } from "../material-from-input.js";
import { readKeychainItem, withheldKeychainFinding } from "../keychain-consent-gate.js";
import type { CredentialSource, KeychainItem } from "../credential-source.js";
import {
  isoFromSeconds,
  jwtClaims,
  origin,
  parseJson,
  slugify,
  type Detector,
  type Finding,
  type ScanContext,
} from "../scan-finding.js";

/**
 * The macOS keychain items the scanner will *try to read*, keyed by service. The
 * `macos-keychain-inventory` detector below reports every credential-shaped item
 * without opening it; this allowlist is the narrower set the owner named as worth
 * a deliberate read attempt — the developer-tool tokens (Codex, Tower, Supabase,
 * a GitHub PAT, a Microsoft OneAuth blob) that a re-auth supervisor would want as
 * a fallback.
 *
 * "Worth a deliberate read attempt" is the operative phrase, and it used to be
 * read as licence to attempt the read on every scan. It is not. Being on this
 * list makes an item eligible for release; it does not consent to one. A scan
 * enumerates these and reports them as present-but-not-read, and only a caller
 * that has said it can survive a prompt — `vault scan --release-secrets`, run
 * with the owner there — actually opens them.
 */
interface KeychainSecretSource {
  /** Matches the keychain service (`svce`) name. */
  service: RegExp;
  provider: string;
  /** Purpose for the imported record, given the item's account. */
  purpose: (account: string | null) => string;
}

const KEYCHAIN_SECRET_SOURCES: readonly KeychainSecretSource[] = [
  { service: /^Supabase CLI$/, provider: "supabase", purpose: () => "supabase" },
  { service: /^Codex Auth$/, provider: "openai", purpose: () => "openai/codex" },
  {
    service: /^Codex MCP Credentials$/,
    provider: "codex-mcp",
    // The account is `<mcp-server>|<hash>`; the server name is the purpose.
    purpose: (account) => `codex-mcp/${slugify(account?.split("|")[0] ?? "server")}`,
  },
  { service: /^Tower:.*:PersonalAccessToken$/, provider: "github", purpose: () => "github" },
  { service: /^OneAuthAccount$/, provider: "microsoft", purpose: () => "microsoft/oneauth" },
  { service: /^GitHub - https:\/\/api\.github\.com$/, provider: "github", purpose: () => "github" },
];

/**
 * Returns the `KeychainSecretSource` for the given service if it matches any
 * entry in the `KEYCHAIN_SECRET_SOURCES` list; otherwise, returns `null`.
 *
 * @param service - The service identifier to match against stored secrets.
 * @returns The `KeychainSecretSource` if a match is found, or `null` if not.
 */
export function keychainSecretSourceFor(service: string): KeychainSecretSource | null {
  return KEYCHAIN_SECRET_SOURCES.find((entry) => entry.service.test(service)) ?? null;
}

/**
 * Classify a keychain value that opened. A stored token response (JSON carrying
 * an access token) becomes a refreshable `oauth_token` so its expiry and refresh
 * half are not lost; anything else is an opaque bearer `api_key`. Passwords are
 * not synthesised here: every item on the allowlist is a machine token, and
 * guessing "password" for an opaque string would file it under a login it has no
 * username for.
 */
function keychainSecretMaterial(raw: string): SecretMaterial {
  const value = raw.trim();
  const document = parseJson(value);
  const accessToken = document
    ? (stringField(document, "access_token") ?? stringField(document, "accessToken"))
    : null;
  if (document && accessToken) {
    const refreshToken =
      stringField(document, "refresh_token") ?? stringField(document, "refreshToken");
    return {
      type: "oauth_token",
      accessToken: new SecretValue(accessToken),
      refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
      refreshTokenExpiresAt: null,
      scopes: [],
      subscriptionType: null,
      tokenEndpoint: null,
    };
  }
  return { type: "api_key", apiKey: new SecretValue(value), header: null };
}

/**
 * Resolve one allowlisted keychain item into a finding.
 *
 * Both non-material outcomes land in the same place, and deliberately so. An item
 * this scan was not allowed to open and an item the owner declined to release are
 * the same fact from the report's point of view — the credential is there and the
 * vault does not have it — and the owner's next move is identical either way.
 * What changed is that the first outcome no longer costs a dialog to discover.
 */
async function openKeychainSecret(
  source: CredentialSource,
  context: ScanContext,
  item: KeychainItem,
  match: KeychainSecretSource,
): Promise<Finding> {
  const location = item.account ? `${item.service}/${item.account}` : item.service;
  const suggestedId = slugify(
    "keychain",
    match.provider,
    item.account ?? item.service,
    source.machine,
  );
  const read = await readKeychainItem(source, context, item.service, item.account);
  if (read.state !== "released") {
    return withheldKeychainFinding({
      detector: "macos-keychain-secrets",
      provider: match.provider,
      source,
      context,
      suggestedId,
      label: `keychain item ${location} on ${source.machine} (not read)`,
      purpose: `keychain/${slugify(item.service)}`,
      service: item.service,
      account: item.account,
    });
  }
  const value = read.value;
  const material = keychainSecretMaterial(value);
  return {
    detector: "macos-keychain-secrets",
    provider: match.provider,
    type: material.type,
    suggestedId,
    label: `${match.provider} ${material.type === "oauth_token" ? "login" : "token"} from keychain (${item.service}) on ${source.machine}`,
    purpose: match.purpose(item.account),
    account: item.account,
    expiresAt: material.type === "oauth_token" ? isoFromSeconds(jwtClaims(value)?.exp) : null,
    plan: material.type === "oauth_token" ? "subscription" : "metered_api_key",
    origin: origin(source, "keychain", location, context),
    fingerprints: fingerprintsOf(material),
    notes: ["read from the macOS keychain with the owner's approval"],
    material,
  };
}

export const macosKeychainSecrets: Detector = {
  name: "macos-keychain-secrets",
  provider: "keychain",
  /**
   * Detects and returns secrets stored in the macOS Keychain.
   *
   * Guarantees an array of secrets, each containing the `expiresAt`, `plan`, `origin`, `fingerprints`, `notes`, and `material`.
   * Returns an empty array if the source platform is not macOS.
   *
   * On failure, returns an empty array.
   */
  async detect(source, context) {
    if (source.platform !== "darwin") return [];
    // Collect the allowlisted items, then resolve them concurrently.
    //
    // The concurrency used to be justified as latency control: a locked item costs
    // a full timeout, so opening them in series would make the scan's latency grow
    // with the number of locked items, and "several near-simultaneous 'allow?'
    // prompts are a better failure than a scan that appears to hang". That reasoned
    // about the wrong two options. Stacking the dialogs does not spare the owner
    // any of them — it delivers all of them at once, which is how a scan turns into
    // a wall of modal windows.
    //
    // It is safe to keep now only because the default path no longer releases
    // anything: with `releaseSecrets` false these resolve from enumeration alone,
    // so there is no prompt to multiply. Under an explicit `--release-secrets` the
    // owner has said they are present and expecting to approve things.
    const seen = new Set<string>();
    const targets: Array<{ item: KeychainItem; match: KeychainSecretSource }> = [];
    for (const item of await source.keychainItems()) {
      const match = keychainSecretSourceFor(item.service);
      if (!match) continue;
      const dedupe = `${item.service} ${item.account ?? ""}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      targets.push({ item, match });
    }
    return Promise.all(
      targets.map(({ item, match }) => openKeychainSecret(source, context, item, match)),
    );
  },
};
