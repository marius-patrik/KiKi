import { readFile as readFileFromDisk, readdir } from "node:fs/promises";
import {
  KEYCHAIN_ENUMERATION_ARGV,
  parseKeychainDump,
  runCommand,
  type CredentialSource,
  type KeychainItem,
  type SourcePlatform,
} from "./credential-source.js";

/** The machine this process is running on. */
export class LocalSource implements CredentialSource {
  readonly machine: string;
  readonly platform: SourcePlatform;
  readonly home: string;
  readonly #env: Record<string, string | undefined>;
  readonly #keychainTimeoutMs: number;

  /** Constructs an instance. */
  constructor(options: {
    machine?: string;
    home: string;
    platform?: SourcePlatform;
    env: Record<string, string | undefined>;
    keychainTimeoutMs?: number;
  }) {
    this.machine = options.machine ?? "local";
    this.platform = options.platform ?? (process.platform as SourcePlatform);
    this.home = options.home.replace(/\\/g, "/");
    this.#env = options.env;
    // This deadline bounds one *release* (`keychainSecret`). A read that is going
    // to succeed returns effectively instantly — the item's ACL either lets
    // `security` through or it does not — so the multi-second wait only elapses
    // while a GUI prompt sits unanswered. Three seconds leaves room for an
    // already-authorised read on a busy machine without waiting on a human.
    //
    // What a deadline cannot do is make releasing safe to do in bulk. Killing the
    // child abandons *this* dialog; it does nothing to stop the next call raising
    // the next one, and on 2026-07-30 that is exactly what happened — roughly a
    // hundred dialogs, each one individually bounded. Bulk safety comes from not
    // asking, which is `readKeychainItem`'s job, not from asking with a stopwatch.
    this.#keychainTimeoutMs = options.keychainTimeoutMs ?? 3_000;
  }

  /** readFile implementation. */
  async readFile(file: string): Promise<string | null> {
    try {
      return await readFileFromDisk(file, "utf8");
    } catch {
      return null;
    }
  }

  /**
   * List the files within a specified directory.
   *
   * Returns an array of file names from the directory.
   * If an error occurs during directory listing, returns an empty array.
   */
  async listDirectory(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * Enumerate the keychain without releasing anything.
   *
   * A keychain item is two separable things: attributes (service, account,
   * timestamps), stored in the clear, and the data blob, encrypted and guarded by
   * an ACL. `dump-keychain` reads only attributes; `-d` additionally reads the
   * data. The absence of `-d` here is load-bearing rather than incidental, which
   * is why the argv is a named constant the suite asserts on.
   *
   * MEASURED, once, on macOS 26.5.2 (25F84), against a throwaway keychain holding
   * three generic passwords — two created with `-T ""`, an empty trusted-
   * application list — with the keychain then **locked**, so no data in it was
   * decryptable at all:
   *
   *     security dump-keychain <kc>                    rc=0, 93ms, all 3 items
   *     security find-generic-password -s <svc> <kc>   rc=0, 96ms, attributes
   *     …same, for a service that does not exist       rc=44, "could not be found"
   *
   * Attributes came back from a locked keychain in under a tenth of a second.
   * Succeeding against a keychain whose contents cannot be decrypted is the
   * substantive part: these commands cannot have read data they had no key for.
   *
   * ASSERTED, NOT VERIFIED — and deliberately left that way. That `-d` and `-w`
   * raise one owner dialog per foreign item is taken from Apple's documented
   * keychain ACL behaviour and from the incident recorded in `docs/PROGRAMME.md`
   * §5, *not* from an experiment here. Neither flag has been run against any
   * keychain in the course of this work. Confirming them would mean deliberately
   * raising the dialogs this change exists to prevent, on a machine whose owner
   * has already sat through about a hundred of them.
   *
   * Note also the reach of the measurement above: one macOS version, one throwaway
   * keychain, three items. It shows this argv returning attributes from a keychain
   * it demonstrably could not decrypt. It is not a general proof about every item
   * shape a real login keychain might hold.
   *
   * Treat that as the standing rule for this file. **Do not run `security` to
   * check a hypothesis about this code, on any keychain, including one you
   * created yourself.** The injectable `CredentialSource` below is how these paths
   * are tested, and it is sufficient — the property that matters is "the release
   * call is never made", which is observable at the seam without an OS in the loop.
   *
   * The tempting alternative — enumerate with `-d` so one pass both lists and
   * reads — is precisely the defect this replaced. It costs one owner dialog per
   * foreign item, and no timeout can buy that back.
   */
  async keychainItems(): Promise<KeychainItem[]> {
    if (this.platform !== "darwin") return [];
    const dump = await this.#security([...KEYCHAIN_ENUMERATION_ARGV], 20_000);
    return dump === null ? [] : parseKeychainDump(dump);
  }

  /**
   * Release one item's secret material — the consenting path, and the one that
   * costs the owner a dialog.
   *
   * `-w` writes the password to stdout, which means decrypting the data blob,
   * which means the OS evaluates the item's ACL. An item written by another
   * application is not on that ACL, so the owner is asked to approve it, once per
   * item. That mechanism is asserted from Apple's documented ACL behaviour and
   * from what the owner sat through on 2026-07-30 — it is deliberately not
   * re-confirmed by experiment, because the only experiment that would confirm it
   * is the one that hurts them.
   *
   * The bounded wait below is real but modest: it converts one unanswered dialog
   * into "present, needs the owner", a finding rather than a hang. It was
   * originally documented as if that were the whole hazard. It is not. A timeout
   * stops a hang; it does nothing about N prompts, because each abandoned call
   * leaves the next one free to raise the next dialog. Calling this in a loop is
   * the defect, not calling it slowly.
   *
   * So this method is not the place where safety lives. Safety is that an
   * unattended scan never reaches here at all — `readKeychainItem` refuses unless
   * a caller has explicitly said it can survive a prompt.
   */
  async keychainSecret(service: string, account: string | null): Promise<string | null> {
    if (this.platform !== "darwin") return null;
    const args = [
      "find-generic-password",
      "-s",
      service,
      ...(account ? ["-a", account] : []),
      "-w",
    ];
    const value = await this.#security(args, this.#keychainTimeoutMs);
    return value === null ? null : value.trim();
  }

  /** environment implementation. */
  async environment(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.#env))
      if (typeof value === "string") out[key] = value;
    return out;
  }

  /** #security implementation. */
  async #security(args: string[], timeoutMs: number): Promise<string | null> {
    return runCommand("security", args, timeoutMs);
  }
}
