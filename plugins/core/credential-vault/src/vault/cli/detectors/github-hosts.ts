import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { fingerprintsOf } from "../material-from-input.js";
import { origin, slugify, type Detector, type Finding } from "../scan-finding.js";
import { parseGitHubHosts } from "../../../file-providers.js";

export type { GitHubHostEntry } from "../../../file-providers.js";
export { parseGitHubHosts } from "../../../file-providers.js";

/**
 * The GitHub CLI's `hosts.yml`, at both the XDG path and the Windows roaming
 * one. Parsed by hand rather than with a YAML library: the file is two levels of
 * `key: value`, and this module takes no new dependencies.
 */
export const githubHosts: Detector = {
  name: "github-hosts",
  provider: "github",
  /** detect implementation. */
  async detect(source, context) {
    const candidates = [
      joinSource(source.home, ".config/gh/hosts.yml"),
      joinSource(source.home, "AppData/Roaming/GitHub CLI/hosts.yml"),
    ];
    for (const file of candidates) {
      const raw = await source.readFile(file);
      if (!raw) continue;
      const hosts = parseGitHubHosts(raw);
      const findings: Finding[] = [];
      for (const host of hosts) {
        const material: SecretMaterial = {
          type: "api_key",
          apiKey: new SecretValue(host.token),
          header: "Authorization",
        };
        findings.push({
          detector: this.name,
          provider: "github",
          type: "api_key",
          suggestedId: slugify("github", host.host, source.machine),
          label: `GitHub CLI token for ${host.host} on ${source.machine}`,
          purpose: "github",
          account: host.user,
          expiresAt: null,
          plan: "unknown",
          origin: origin(source, "file", file, context),
          fingerprints: fingerprintsOf(material),
          notes: [
            "gh OAuth tokens do not carry an expiry; they are revoked or rotated by the owner",
          ],
          material,
        });
      }
      if (findings.length > 0) return findings;
    }
    return [];
  },
};
