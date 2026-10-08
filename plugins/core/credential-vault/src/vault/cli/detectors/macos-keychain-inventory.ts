import { origin, slugify, type Detector } from "../scan-finding.js";
import { keychainSecretSourceFor } from "./macos-keychain-secrets.js";

/**
 * Everything else in the macOS keychain that names itself as a credential.
 * Reported without being read: an item another application owns makes the OS ask
 * the owner before releasing it, and a scan is exactly the wrong moment to raise
 * a modal dialog. So this detector says "there is a credential here" and leaves
 * importing it to a deliberate, attended `vault add`.
 *
 * This detector had the right instinct before the rest of the module did. What
 * was special-cased here — report it, do not demand it — is now what every
 * keychain detector does by default, via `readKeychainItem`.
 */
const KEYCHAIN_CREDENTIAL_HINT = /(token|credential|auth|api[-_ ]?key|oauth)/i;
const KEYCHAIN_IGNORED =
  /^(com\.apple\.|Chrome Safe Storage|.*Safe Storage$|AirPort|BluetoothGlobal|MobileBluetooth|WiFiAnalytics|iCloud$)/;

export const macosKeychainInventory: Detector = {
  name: "macos-keychain-inventory",
  provider: "keychain",
  /**
   * Detects keychain items that match specific criteria.
   *
   * Returns an array of findings containing keychain items that are not ignored,
   * do not match the claimed services, and meet the credential hint pattern.
   *
   * If the platform is not macOS (darwin), returns an empty array.
   */
  async detect(source, context) {
    if (source.platform !== "darwin") return [];
    const claimed = new Set(["gemini", "cursor-access-token", "cursor-refresh-token"]);
    const findings = [];
    for (const item of await source.keychainItems()) {
      const service = item.service;
      if (!service || KEYCHAIN_IGNORED.test(service) || claimed.has(service)) continue;
      if (/^Claude Code-credentials/.test(service) || /^gh:/.test(service)) continue;
      // The read-attempt detector above owns these; letting the inventory report
      // them too would file one item under two findings.
      if (keychainSecretSourceFor(service)) continue;
      if (!KEYCHAIN_CREDENTIAL_HINT.test(service)) continue;
      findings.push({
        detector: this.name,
        provider: "keychain",
        type: "generic_note" as const,
        suggestedId: slugify("keychain", service, item.account, source.machine),
        label: `keychain item ${service}${item.account ? ` (${item.account})` : ""} on ${source.machine}`,
        purpose: `keychain/${slugify(service)}`,
        account: item.account,
        expiresAt: null,
        plan: "unknown" as const,
        origin: origin(
          source,
          "keychain",
          item.account ? `${service}/${item.account}` : service,
          context,
        ),
        fingerprints: [],
        notes: ["reported only: reading it needs the owner to approve a keychain prompt"],
        material: null,
      });
    }
    return findings;
  },
};
