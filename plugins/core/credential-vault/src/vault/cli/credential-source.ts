import { spawn } from "node:child_process";

export type SourcePlatform = "darwin" | "linux" | "win32";

export interface KeychainItem {
  service: string;
  account: string | null;
}

/**
 * One machine, as far as a detector is concerned. Every method is read-only —
 * there is deliberately no `write`, so no detector can modify a credential file
 * even by mistake — and every method answers "absent" rather than throwing, so a
 * scan of a machine missing half these tools still reports the other half.
 */
export interface CredentialSource {
  /** Machine identifier recorded as provenance on anything imported. */
  readonly machine: string;
  readonly platform: SourcePlatform;
  /** Home directory, always with forward slashes so detectors need one form. */
  readonly home: string;
  readFile(file: string): Promise<string | null>;
  listDirectory(directory: string): Promise<string[]>;
  /**
   * Every keychain item, **metadata only**: service, account, and the fact that
   * the item exists. Enumerating is not releasing, and an implementation of this
   * method may not prompt the owner — see `LocalSource.keychainItems` for why
   * that is achievable rather than aspirational. Empty where there is no
   * keychain.
   */
  keychainItems(): Promise<KeychainItem[]>;
  /**
   * **Release** one item's secret material. This is the consenting path: on macOS
   * it can put a modal dialog in front of the owner, once per item, and nothing
   * this process does can suppress it. No unattended scan may call it —
   * `readKeychainItem` is the gate that enforces that, and detectors go through
   * the gate, never here. Null when absent or when the OS refused.
   */
  keychainSecret(service: string, account: string | null): Promise<string | null>;
  environment(): Promise<Record<string, string>>;
}

/**
 * Joins an array of strings into a single path string with slashes, ensuring no
 * consecutive slashes are present. Returns null if any part of the input is
 * invalid or if the operation fails.
 *
 * @param parts - An array of strings representing path components.
 * @returns A string representing the joined path or null on failure.
 */
export function joinSource(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

/**
 * The exact argv that enumerates the macOS keychain. Named, exported and asserted
 * on in the suite because the invariant that matters is a *negative* one — no
 * `-d`, no `-w` — and a negative invariant buried in a call site is one refactor
 * away from being lost. Adding a data flag here would turn a silent metadata read
 * into one owner dialog per foreign item; the test is what makes that fail in CI
 * instead of in front of the owner.
 */
export const KEYCHAIN_ENUMERATION_ARGV: readonly string[] = ["dump-keychain"];

/** Argv flags that make `security` decrypt and emit an item's data. */
export const KEYCHAIN_RELEASE_FLAGS: readonly string[] = ["-d", "-w", "--data"];

/**
 * Run a command with a hard deadline and no shell. Returns null on any failure,
 * because every caller's question is "is this credential readable?" and a
 * missing binary, a non-zero exit, and a blocked authorization dialog are all
 * answered the same way: no.
 *
 * Ported from Bun.spawn to node:child_process; behaviour is otherwise identical.
 */
export async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => child.kill(9), timeoutMs);
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? stdout : null);
    });
  });
}

/** shellQuote implementation. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** psLiteral implementation. */
export function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `security dump-keychain` emits attribute lines; only service and account matter. */
export function parseKeychainDump(dump: string): KeychainItem[] {
  const items: KeychainItem[] = [];
  let service: string | null = null;
  let account: string | null = null;
  for (const line of dump.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("keychain:")) {
      if (service) items.push({ service, account });
      service = null;
      account = null;
      continue;
    }
    const svce = /^"svce"<blob>="(.*)"$/.exec(trimmed);
    if (svce) service = svce[1] ?? null;
    const acct = /^"acct"<blob>="(.*)"$/.exec(trimmed);
    if (acct) account = acct[1] ?? null;
  }
  if (service) items.push({ service, account });
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.service}${item.account ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * `go-keyring` — which the GitHub CLI, the Gemini CLI and Antigravity all use —
 * base64-wraps any value that is not clean UTF-8. Unwrapped here so detectors
 * see the same JSON they would have seen from a file.
 */
export function decodeKeychainPayload(value: string): string {
  const prefix = "go-keyring-base64:";
  if (!value.startsWith(prefix)) return value;
  try {
    return Buffer.from(value.slice(prefix.length), "base64").toString("utf8");
  } catch {
    return value;
  }
}
