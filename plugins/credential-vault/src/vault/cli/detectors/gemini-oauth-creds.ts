import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { stringField, fingerprintsOf } from "../material-from-input.js";
import {
  claimString,
  isoFromMilliseconds,
  jwtClaims,
  origin,
  parseJson,
  slugify,
  type Detector,
} from "../scan-finding.js";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** `~/.gemini/oauth_creds.json`, written by the Gemini CLI's Google sign-in. */
export const geminiOauthCreds: Detector = {
  name: "gemini-oauth-creds",
  provider: "google",
  /**
   * Detects and returns OAuth credentials for the specified provider.
   *
   * Guarantees an array of secret material objects if credentials are found;
   * otherwise, returns an empty array.
   *
   * @param source - The source providing the file paths and reading capabilities.
   * @param context - Additional context for the detection process.
   * @returns An array of secret material objects containing OAuth credentials or an empty array.
   */
  async detect(source, context) {
    const file = joinSource(source.home, ".gemini/oauth_creds.json");
    const document = parseJson(await source.readFile(file));
    const accessToken = document ? stringField(document, "access_token") : null;
    if (!document || !accessToken) return [];
    const accounts = parseJson(
      await source.readFile(joinSource(source.home, ".gemini/google_accounts.json")),
    );
    const refreshToken = stringField(document, "refresh_token");
    const material: SecretMaterial = {
      type: "oauth_token",
      accessToken: new SecretValue(accessToken),
      refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
      refreshTokenExpiresAt: null,
      scopes: (stringField(document, "scope") ?? "").split(/\s+/).filter(Boolean),
      subscriptionType: null,
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    };
    return [
      {
        detector: this.name,
        provider: "google",
        type: "oauth_token",
        suggestedId: slugify("google", "gemini-cli", source.machine),
        label: `Google Gemini CLI login on ${source.machine}`,
        purpose: "google/gemini-cli",
        account:
          (accounts ? stringField(accounts, "active") : null) ??
          claimString(jwtClaims(stringField(document, "id_token") ?? ""), "email"),
        expiresAt: isoFromMilliseconds(document.expiry_date),
        plan: "subscription",
        origin: origin(source, "file", file, context),
        fingerprints: fingerprintsOf(material),
        notes: ["Google refresh tokens do not expire on a schedule; they are revoked"],
        material,
      },
    ];
  },
};
