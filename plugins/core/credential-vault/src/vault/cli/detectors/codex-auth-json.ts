import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { fingerprintsOf, stringField } from "../material-from-input.js";
import {
  claimString,
  isoFromSeconds,
  jwtClaims,
  origin,
  parseJson,
  record,
  slugify,
  type Detector,
  type Finding,
} from "../scan-finding.js";

const OPENAI_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";

/**
 * `~/.codex/auth.json`. Carries the ChatGPT OAuth triad and, when the owner
 * chose a metered key instead, `OPENAI_API_KEY`. Both are reported: they are
 * different products billed differently, and which one is present is exactly
 * what the owner is trying to find out.
 */
export const codexAuthJson: Detector = {
  name: "codex-auth-json",
  provider: "openai",
  /**
   * Detects authentication information from the provided source.
   *
   * Guarantees an array of `Finding` objects if authentication tokens are found;
   * otherwise, returns an empty array. On failure to parse or find tokens, no
   * findings are returned.
   *
   * @param source - The source providing the file to check.
   * @param context - Additional context for the detection process.
   * @returns An array of `Finding` objects containing authentication details or an empty array.
   */
  async detect(source, context) {
    const file = joinSource(source.home, ".codex/auth.json");
    const document = parseJson(await source.readFile(file));
    if (!document) return [];
    const findings: Finding[] = [];
    const tokens = record(document.tokens);
    const accessToken = tokens ? stringField(tokens, "access_token") : null;
    if (accessToken) {
      const idClaims = jwtClaims(stringField(tokens as Record<string, unknown>, "id_token") ?? "");
      const accessClaims = jwtClaims(accessToken);
      const auth =
        record(idClaims?.["https://api.openai.com/auth"]) ??
        record(accessClaims?.["https://api.openai.com/auth"]);
      const plan = auth ? stringField(auth, "chatgpt_plan_type") : null;
      const account =
        claimString(idClaims, "email") ?? (tokens ? stringField(tokens, "account_id") : null);
      const refreshToken = tokens ? stringField(tokens, "refresh_token") : null;
      const material: SecretMaterial = {
        type: "oauth_token",
        accessToken: new SecretValue(accessToken),
        refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
        refreshTokenExpiresAt: null,
        scopes: [],
        subscriptionType: plan,
        tokenEndpoint: OPENAI_TOKEN_ENDPOINT,
      };
      findings.push({
        detector: this.name,
        provider: "openai",
        type: "oauth_token",
        suggestedId: slugify("openai", "chatgpt", source.machine),
        label: `OpenAI ChatGPT login (${plan ?? "unknown plan"}) on ${source.machine}`,
        purpose: "openai/chatgpt",
        account,
        expiresAt: isoFromSeconds(accessClaims?.exp),
        plan: "subscription",
        origin: origin(source, "file", file, context),
        fingerprints: fingerprintsOf(material),
        notes: [
          `codex auth_mode=${stringField(document, "auth_mode") ?? "unknown"}`,
          ...(stringField(document, "last_refresh")
            ? [`last refreshed ${stringField(document, "last_refresh")}`]
            : []),
        ],
        material,
      });
    }
    const apiKey = stringField(document, "OPENAI_API_KEY");
    if (apiKey) {
      const material: SecretMaterial = {
        type: "api_key",
        apiKey: new SecretValue(apiKey),
        header: "Authorization",
      };
      findings.push({
        detector: this.name,
        provider: "openai",
        type: "api_key",
        suggestedId: slugify("openai", "api-key", source.machine),
        label: `OpenAI API key on ${source.machine}`,
        purpose: "openai",
        account: null,
        expiresAt: null,
        plan: "metered_api_key",
        origin: origin(source, "file", file, context),
        fingerprints: fingerprintsOf(material),
        notes: ["metered: billed per token, does not expire"],
        material,
      });
    }
    return findings;
  },
};
