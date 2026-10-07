import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { stringField, fingerprintsOf } from "../material-from-input.js";
import {
  isoFromSeconds,
  isoFromText,
  jwtClaims,
  origin,
  parseJson,
  record,
  slugify,
  type Detector,
  type Finding,
} from "../scan-finding.js";

/** `~/.grok/auth.json`: one entry per issuer, keyed `<issuer>::<client id>`. */
export const grokAuthJson: Detector = {
  name: "grok-auth-json",
  provider: "xai",
  /** detect implementation. */
  async detect(source, context) {
    const file = joinSource(source.home, ".grok/auth.json");
    const document = parseJson(await source.readFile(file));
    if (!document) return [];
    const findings: Finding[] = [];
    for (const [key, value] of Object.entries(document)) {
      const entry = record(value);
      const accessToken = entry ? stringField(entry, "key") : null;
      if (!entry || !accessToken) continue;
      const refreshToken = stringField(entry, "refresh_token");
      const material: SecretMaterial = {
        type: "oauth_token",
        accessToken: new SecretValue(accessToken),
        refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
        refreshTokenExpiresAt: null,
        scopes:
          typeof jwtClaims(accessToken)?.scope === "string"
            ? String(jwtClaims(accessToken)?.scope).split(/\s+/)
            : [],
        subscriptionType: null,
        tokenEndpoint: null,
      };
      findings.push({
        detector: this.name,
        provider: "xai",
        type: "oauth_token",
        suggestedId: slugify("xai", "grok-cli", source.machine),
        label: `xAI Grok CLI login on ${source.machine}`,
        purpose: "xai/grok-cli",
        account: stringField(entry, "email"),
        expiresAt: isoFromText(entry.expires_at) ?? isoFromSeconds(jwtClaims(accessToken)?.exp),
        plan: "subscription",
        origin: origin(source, "file", file, context),
        fingerprints: fingerprintsOf(material),
        notes: [
          `issuer ${key.split("::")[0] ?? "unknown"}`,
          "token endpoint unknown: refresh needs the xAI OIDC discovery document",
        ],
        material,
      });
    }
    return findings;
  },
};
