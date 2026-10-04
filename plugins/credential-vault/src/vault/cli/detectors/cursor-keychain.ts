import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { fingerprintsOf } from "../material-from-input.js";
import { readKeychainItem, withheldKeychainFinding } from "../keychain-consent-gate.js";
import {
  isoFromSeconds,
  jwtClaims,
  origin,
  parseJson,
  record,
  slugify,
  type Detector,
} from "../scan-finding.js";
import { stringField } from "../material-from-input.js";

/**
 * Cursor splits its login across two keychain services. They are one credential
 * from the owner's point of view, so they are recomposed into one record rather
 * than filed as two halves that would each look unrefreshable.
 */
export const cursorKeychain: Detector = {
  name: "cursor-keychain",
  provider: "cursor",
  /** detect implementation. */
  async detect(source, context) {
    if (source.platform !== "darwin") return [];
    const access = await readKeychainItem(source, context, "cursor-access-token", null);
    if (access.state === "absent") return [];
    if (access.state === "withheld") {
      return [
        withheldKeychainFinding({
          detector: this.name,
          provider: "cursor",
          source,
          context,
          suggestedId: slugify("cursor", source.machine),
          label: `Cursor login in the keychain on ${source.machine}`,
          purpose: "cursor",
          service: "cursor-access-token",
          account: null,
        }),
      ];
    }
    const accessToken = access.value;
    const refresh = await readKeychainItem(source, context, "cursor-refresh-token", null);
    // The refresh half staying shut is survivable where the access half opened:
    // the record is still importable, just not self-healing. Only the access half
    // decides whether there is a credential here at all.
    const refreshToken = refresh.state === "released" ? refresh.value : null;
    const config = parseJson(
      await source.readFile(joinSource(source.home, ".cursor/cli-config.json")),
    );
    const authInfo = config ? record(config.authInfo) : null;
    const material: SecretMaterial = {
      type: "oauth_token",
      accessToken: new SecretValue(accessToken.trim()),
      refreshToken: refreshToken ? new SecretValue(refreshToken.trim()) : null,
      refreshTokenExpiresAt: null,
      scopes:
        typeof jwtClaims(accessToken)?.scope === "string"
          ? String(jwtClaims(accessToken)?.scope).split(/\s+/)
          : [],
      subscriptionType: null,
      tokenEndpoint: null,
    };
    return [
      {
        detector: this.name,
        provider: "cursor",
        type: "oauth_token",
        suggestedId: slugify("cursor", source.machine),
        label: `Cursor login on ${source.machine}`,
        purpose: "cursor",
        account: authInfo ? stringField(authInfo, "email") : null,
        expiresAt: isoFromSeconds(jwtClaims(accessToken)?.exp),
        plan: "subscription",
        origin: origin(source, "keychain", "cursor-access-token", context),
        fingerprints: fingerprintsOf(material),
        notes: ["access and refresh halves recomposed from two keychain services"],
        material,
      },
    ];
  },
};
