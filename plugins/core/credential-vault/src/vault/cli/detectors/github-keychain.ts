import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { fingerprintsOf } from "../material-from-input.js";
import { readKeychainItem, withheldKeychainFinding } from "../keychain-consent-gate.js";
import { origin, slugify, type Detector, type Finding } from "../scan-finding.js";

/** macOS keeps the same gh token in the keychain when the owner enabled it. */
export const githubKeychain: Detector = {
  name: "github-keychain",
  // jscpd:ignore-start -- mirrors detectors/claude-credentials.ts's small detector shape for a different credential source
  provider: "github",
  /**
   * Detects GitHub CLI keychain tokens for the specified provider.
   *
   * Returns an array of findings if any are detected; otherwise, returns an empty array.
   * If the source platform is not "darwin", no tokens are detected.
   * On failure, returns an empty array.
   */
  async detect(source, context) {
    if (source.platform !== "darwin") return [];
    const services = (await source.keychainItems())
      .map((item) => item.service)
      .filter((service) => /^gh:/.test(service));
    // jscpd:ignore-end
    const findings: Finding[] = [];
    for (const service of [...new Set(services)].sort()) {
      const read = await readKeychainItem(source, context, service, null);
      if (read.state === "absent") continue;
      if (read.state === "withheld") {
        findings.push(
          withheldKeychainFinding({
            detector: this.name,
            provider: "github",
            source,
            context,
            suggestedId: slugify("github", "keychain", service.slice(3), source.machine),
            label: `GitHub CLI keychain token for ${service.slice(3)} on ${source.machine}`,
            purpose: "github",
            service,
            account: null,
          }),
        );
        continue;
      }
      const token = read.value.trim();
      if (!token) continue;
      const material: SecretMaterial = {
        type: "api_key",
        apiKey: new SecretValue(token),
        header: "Authorization",
      };
      findings.push({
        detector: this.name,
        provider: "github",
        type: "api_key",
        suggestedId: slugify("github", "keychain", service.slice(3), source.machine),
        label: `GitHub CLI keychain token for ${service.slice(3)} on ${source.machine}`,
        purpose: "github",
        account: null,
        expiresAt: null,
        plan: "unknown",
        origin: origin(source, "keychain", service, context),
        fingerprints: fingerprintsOf(material),
        notes: ["likely the same token as hosts.yml; import one of the two"],
        material,
      });
    }
    return findings;
  },
};
