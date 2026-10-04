import { joinSource } from "../credential-source.js";
import { origin, slugify, type Detector, type Finding } from "../scan-finding.js";

/**
 * The saved-password stores a browser or password manager keeps. These are the
 * home of exactly the classes the vault most lacks — website passwords, and with
 * them the recovery paths behind a dead OAuth grant — but every one of them is
 * encrypted at rest under a key the vault must not attempt to recover: a browser
 * store behind the OS keychain, a manager behind a master passphrase. So this
 * detector does what the rules allow and no more — it establishes the store is
 * present, counts what it can from cleartext metadata, and reports what unlocking
 * would take. Nothing is decrypted; every finding is inventory, never material.
 */
interface PasswordStoreProbe {
  provider: string;
  /** Files that, if any is present, mean the store exists. */
  files: (home: string) => string[];
  unlock: string;
}

const PASSWORD_STORES: readonly PasswordStoreProbe[] = [
  {
    provider: "chrome",
    files: (home) => [
      joinSource(home, "Library/Application Support/Google/Chrome/Default/Login Data"),
    ],
    unlock:
      "encrypted under the 'Chrome Safe Storage' key in the login keychain; decrypting needs that key and the Chromium login DB format",
  },
  {
    provider: "bitwarden",
    files: (home) => [joinSource(home, "Library/Application Support/Bitwarden/data.json")],
    unlock: "locked under the account master password",
  },
  {
    provider: "1password",
    files: (home) => [joinSource(home, ".config/op/config")],
    unlock: "locked under the 1Password account; the app or `op signin` must unlock it",
  },
];

export const passwordStores: Detector = {
  name: "password-stores",
  provider: "password-store",
  /** detect implementation. */
  async detect(source, context) {
    const findings: Finding[] = [];
    const /** push implementation. */
      push = (provider: string, location: string, note: string, account: string | null = null) =>
        findings.push({
          detector: this.name,
          provider,
          type: "password",
          suggestedId: slugify("pwstore", provider, source.machine),
          label: `${provider} saved-password store on ${source.machine} (present, locked)`,
          purpose: `password-store/${slugify(provider)}`,
          account,
          expiresAt: null,
          plan: "unknown",
          origin: origin(source, "file", location, context),
          fingerprints: [],
          notes: [note],
          material: null,
        });

    for (const store of PASSWORD_STORES) {
      for (const file of store.files(source.home)) {
        // A missing file reads back as null locally and as an empty string over
        // the ssh transport; both mean "not here", so presence needs real bytes.
        if (!(await source.readFile(file))) continue;
        push(
          store.provider,
          file,
          `present but locked: ${store.unlock}. Not extracted (locked store).`,
        );
        break;
      }
    }

    // Firefox names its profiles in a cleartext ini, so the store and the number
    // of logins in it are inventory metadata even though every login is sealed.
    const ini = await source.readFile(
      joinSource(source.home, "Library/Application Support/Firefox/profiles.ini"),
    );
    if (ini) {
      for (const line of ini.split(/\r?\n/)) {
        const match = /^Path=(.+)$/.exec(line.trim());
        if (!match) continue;
        const logins = await source.readFile(
          joinSource(
            source.home,
            "Library/Application Support/Firefox",
            match[1]!.trim(),
            "logins.json",
          ),
        );
        if (!logins) continue;
        const count = (logins.match(/"encryptedUsername"/g) ?? []).length;
        push(
          "firefox",
          joinSource(
            source.home,
            "Library/Application Support/Firefox",
            match[1]!.trim(),
            "logins.json",
          ),
          `present but locked: ${count} saved logins, each NSS-encrypted; decrypting needs the Firefox primary password (if set) via key4.db. Not extracted (locked store).`,
        );
      }
    }
    return findings;
  },
};
