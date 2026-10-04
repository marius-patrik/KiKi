import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { stringField, fingerprintsOf } from "../material-from-input.js";
import { readKeychainItem, withheldKeychainFinding } from "../keychain-consent-gate.js";
import {
  claimString,
  isoFromText,
  jwtClaims,
  origin,
  parseJson,
  record,
  slugify,
  type Detector,
} from "../scan-finding.js";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Antigravity's Google login. On macOS it lives in the keychain under service
 * `gemini`, go-keyring wrapped; the token document sits under `token`.
 */
export const antigravityKeychain: Detector = {
  name: "antigravity-keychain",
  provider: "google",
  /** detect implementation. */
  async detect(source, context) {
    if (source.platform !== "darwin") return [];
    const read = await readKeychainItem(source, context, "gemini", "antigravity");
    if (read.state === "absent") return [];
    if (read.state === "withheld") {
      return [
        withheldKeychainFinding({
          detector: this.name,
          provider: "google",
          source,
          context,
          suggestedId: slugify("google", "antigravity", source.machine),
          label: `Google Antigravity login in the keychain on ${source.machine}`,
          purpose: "google/antigravity",
          service: "gemini",
          account: "antigravity",
        }),
      ];
    }
    const document = parseJson(read.value);
    const token = document ? record(document.token) : null;
    const accessToken = token ? stringField(token, "access_token") : null;
    if (!document || !token || !accessToken) return [];
    const refreshToken = stringField(token, "refresh_token");
    const material: SecretMaterial = {
      type: "oauth_token",
      accessToken: new SecretValue(accessToken),
      refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
      refreshTokenExpiresAt: null,
      scopes: [],
      subscriptionType: stringField(document, "auth_method"),
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    };
    return [
      {
        detector: this.name,
        provider: "google",
        type: "oauth_token",
        suggestedId: slugify("google", "antigravity", source.machine),
        label: `Google Antigravity login on ${source.machine}`,
        purpose: "google/antigravity",
        account: claimString(jwtClaims(stringField(document, "id_token") ?? ""), "email"),
        expiresAt: isoFromText(token.expiry),
        plan: "subscription",
        origin: origin(source, "keychain", "gemini/antigravity", context),
        fingerprints: fingerprintsOf(material),
        notes: [`auth method ${stringField(document, "auth_method") ?? "unknown"}`],
        material,
      },
    ];
  },
};
