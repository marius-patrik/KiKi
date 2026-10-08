import { SecretValue } from "../../secret.js";
import type { SecretMaterial, SecretType } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { fingerprintsOf, stringField } from "../material-from-input.js";
import {
  claimString,
  isoFromMilliseconds,
  isoFromSeconds,
  isoFromText,
  jwtClaims,
  origin,
  parseJson,
  slugify,
  type Detector,
  type Finding,
} from "../scan-finding.js";

/** The Agent OS state root's own secrets directory: `*.secret` files and PEMs. */
export const agentOsSecrets: Detector = {
  name: "agent-os-secrets",
  provider: "andromeda",
  /**
   * Detects secrets in the specified source directory.
   *
   * Guarantees:
   * - Returns an array of `Finding` objects representing detected secrets.
   * - Ignores files named "registry.json" and those starting with a dot.
   * - Logs an error and skips processing for files without a valid JSON content.
   *
   * On failure:
   * - Skips processing for files that do not contain an `access_token` or `refresh_token`.
   */
  async detect(source, context) {
    const directory = joinSource(source.home, ".agents/secrets");
    const names = await source.listDirectory(directory);
    const findings: Finding[] = [];
    for (const name of names.sort()) {
      if (name === "registry.json" || name.startsWith(".")) continue;
      const file = joinSource(directory, name);
      const raw = (await source.readFile(file))?.trim();
      if (!raw) continue;
      const stem = name.replace(/\.(secret|pem|json)$/, "");
      const suggestedId = slugify("agents", stem, source.machine);
      const document = parseJson(raw);
      const accessToken = document
        ? (stringField(document, "access_token") ?? stringField(document, "accessToken"))
        : null;
      if (document && accessToken) {
        // Some tools drop a whole token response in here rather than a bare
        // key. Filing that as an `api_key` would hide an expiry and a refresh
        // token the supervisor could have used, which is the one mistake this
        // whole component exists to stop.
        const refreshToken =
          stringField(document, "refresh_token") ?? stringField(document, "refreshToken");
        const provider = stringField(document, "provider") ?? slugify(stem);
        const material: SecretMaterial = {
          type: "oauth_token",
          accessToken: new SecretValue(accessToken),
          refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
          refreshTokenExpiresAt: null,
          scopes: [],
          subscriptionType: null,
          tokenEndpoint: null,
        };
        findings.push({
          detector: this.name,
          provider,
          type: "oauth_token",
          suggestedId,
          label: `${provider} login stored in the Agent OS state root on ${source.machine}`,
          purpose: `${slugify(provider)}/${slugify(stem)}`,
          account: stringField(document, "email") ?? claimString(jwtClaims(accessToken), "email"),
          expiresAt:
            isoFromText(document.expires_at) ??
            isoFromMilliseconds(document.expires_at) ??
            isoFromSeconds(jwtClaims(accessToken)?.exp),
          plan: "subscription",
          origin: origin(source, "file", file, context),
          fingerprints: fingerprintsOf(material),
          notes: [
            "a full token response was stored here; the token endpoint is not recorded in the file",
          ],
          material,
        });
        continue;
      }
      // A PEM or any other JSON document is a credential *bundle*, not a bearer
      // string: filing it as an `api_key` would tell the provider harness it
      // could send the whole file in an Authorization header.
      const structured = raw.startsWith("-----BEGIN") || document !== null;
      const type: SecretType = structured ? "generic_note" : "api_key";
      const material: SecretMaterial = structured
        ? { type: "generic_note", note: new SecretValue(raw) }
        : { type: "api_key", apiKey: new SecretValue(raw), header: null };
      findings.push({
        detector: this.name,
        provider: "andromeda",
        type,
        suggestedId,
        label: `Agent OS secret ${name} on ${source.machine}`,
        purpose: `andromeda/${slugify(stem)}`,
        account: null,
        expiresAt: null,
        plan: "unknown",
        origin: origin(source, "file", file, context),
        fingerprints: fingerprintsOf(material),
        notes: structured ? ["stored as a note: it is a key bundle, not a bearer string"] : [],
        material,
      });
    }
    return findings;
  },
};
