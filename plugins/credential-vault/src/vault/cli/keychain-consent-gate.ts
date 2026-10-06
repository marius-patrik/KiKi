import { decodeKeychainPayload, type CredentialSource } from "./credential-source.js";
import { origin, type Finding, type ScanContext } from "./scan-finding.js";

/**
 * What a detector learned about one keychain item.
 *
 * Three states rather than two, because "there is nothing here" and "there is
 * something here that I did not open" are different facts about the machine and
 * the owner needs to see the difference. Collapsing `withheld` into `absent`
 * would under-report the estate — the credential is real, named and findable.
 * Collapsing it into an error would make an unattended scan fail on a perfectly
 * healthy Mac.
 */
export type KeychainRead =
  | { state: "released"; value: string }
  | { state: "withheld" }
  | { state: "absent" };

/**
 * The gate every keychain detector reads through, and the single place that
 * decides whether this process is allowed to make the OS ask the owner for
 * something.
 *
 * Enumerating and releasing are different operations with different consent
 * requirements, and the previous code conflated them: every detector called
 * straight through to `keychainSecret`, so merely *looking* at the machine
 * demanded release of every item it recognised. Listing what exists is free —
 * demonstrated, not assumed, in `LocalSource.keychainItems`. Releasing is not: a
 * foreign item costs one modal dialog, so a scan that recognises a hundred items
 * costs a hundred of them, which is what the owner sat through on 2026-07-30.
 *
 * The tempting alternative was to keep releasing but make it cheaper, and the
 * previous code tried both halves of it: open the items concurrently, and bound
 * each read with a timeout. Neither helps, and the first actively hurts.
 * Concurrency turns a hundred sequential dialogs into a hundred stacked ones —
 * the old comment argued that was "a better failure than a scan that appears to
 * hang", which is true only if the alternatives are those two. A timeout merely
 * decides how quickly this process abandons a dialog it has already raised; the
 * dialog is raised either way. The prompt is the cost, and the only way not to
 * pay it is not to ask.
 *
 * The go-keyring unwrapping lives here rather than in `LocalSource` because it is
 * a property of the *convention* the storing application used, not of how this
 * process reached the keychain — so a fixture and a real keychain hand a detector
 * the same bytes.
 */
export async function readKeychainItem(
  source: CredentialSource,
  context: ScanContext,
  service: string,
  account: string | null,
): Promise<KeychainRead> {
  if (!context.releaseSecrets) {
    // The load-bearing line of this whole change: `keychainSecret` is not called.
    // Presence comes from enumeration, which cannot prompt, so an unattended scan
    // still reports the item truthfully — it just does not demand it.
    return (await keychainItemPresent(source, service, account))
      ? { state: "withheld" }
      : { state: "absent" };
  }
  const raw = await source.keychainSecret(service, account);
  if (raw !== null) return { state: "released", value: decodeKeychainPayload(raw.trim()) };
  // The caller consented to a prompt and the item still did not open: either it
  // is absent, or the owner declined or never answered. Enumeration separates the
  // two without asking a second time.
  return (await keychainItemPresent(source, service, account))
    ? { state: "withheld" }
    : { state: "absent" };
}

/**
 * Whether an item exists, from metadata alone.
 *
 * The account comparison is deliberately asymmetric. A caller naming an account
 * wants that item; a caller passing null is asking about the service whatever the
 * account, which is how every single-service detector here is written. And
 * `dump-keychain` does not report `acct` for every item, so an item whose account
 * is unknown must not be excluded by an account the caller happened to name —
 * reporting a credential the owner really has as absent is the worse error of the
 * two.
 */
async function keychainItemPresent(
  source: CredentialSource,
  service: string,
  account: string | null,
): Promise<boolean> {
  const items = await source.keychainItems();
  return items.some(
    (item) =>
      item.service === service &&
      (account === null || item.account === null || item.account === account),
  );
}

/**
 * The note on every item that was found and deliberately not opened. One shared
 * string so the report reads the same whichever detector found the item, and so
 * the owner is told what to do about it rather than just that it happened.
 */
export const KEYCHAIN_WITHHELD_NOTE =
  "present but not read: releasing it needs the owner to approve a keychain prompt, which an unattended scan will not raise; re-run `vault scan --release-secrets` with the owner present to import it";

/**
 * The finding for an item that is definitely there and was deliberately left
 * shut. This is a result, not a failure — it tells the owner precisely which
 * credential exists and that importing it is a decision they take in person.
 */
export function withheldKeychainFinding(spec: {
  detector: string;
  provider: string;
  source: CredentialSource;
  context: ScanContext;
  suggestedId: string;
  label: string;
  purpose: string;
  service: string;
  account: string | null;
}): Finding {
  return {
    detector: spec.detector,
    provider: spec.provider,
    type: "generic_note",
    suggestedId: spec.suggestedId,
    label: spec.label,
    purpose: spec.purpose,
    account: spec.account,
    expiresAt: null,
    plan: "unknown",
    origin: origin(
      spec.source,
      "keychain",
      spec.account ? `${spec.service}/${spec.account}` : spec.service,
      spec.context,
    ),
    fingerprints: [],
    notes: [KEYCHAIN_WITHHELD_NOTE],
    material: null,
  };
}
