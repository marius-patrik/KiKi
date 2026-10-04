import {
  runCommand,
  shellQuote,
  psLiteral,
  type CredentialSource,
  type KeychainItem,
  type SourcePlatform,
} from "./credential-source.js";

export interface SshSourceOptions {
  host: string;
  home: string;
  platform: SourcePlatform;
  machine?: string;
  timeoutMs?: number;
}

/**
 * Another machine, reached over `ssh`. The Windows path is the one that needed
 * care: the default remote shell is `cmd.exe`, which mangles quoting, and the
 * usual text tools are absent, so every read is a PowerShell script delivered as
 * `-EncodedCommand` (UTF-16LE base64) — one argument, no metacharacters, nothing
 * for `cmd` to reinterpret.
 *
 * Values fetched this way exist only in this process's memory on their way into
 * the encrypted vault. Nothing is written on either side.
 */
export class SshSource implements CredentialSource {
  readonly machine: string;
  readonly platform: SourcePlatform;
  readonly home: string;
  readonly #host: string;
  readonly #timeoutMs: number;

  /** Constructs an instance. */
  constructor(options: SshSourceOptions) {
    this.#host = options.host;
    this.machine = options.machine ?? options.host;
    this.platform = options.platform;
    this.home = options.home.replace(/\\/g, "/").replace(/\/$/, "");
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** readFile implementation. */
  async readFile(file: string): Promise<string | null> {
    if (this.platform === "win32") {
      return this.#powershell(
        `$p = ${psLiteral(file)}\nif (Test-Path -LiteralPath $p) { [Console]::Out.Write([IO.File]::ReadAllText($p)) }`,
      );
    }
    return this.#posix(["cat", "--", file]);
  }

  /** listDirectory implementation. */
  async listDirectory(directory: string): Promise<string[]> {
    const raw =
      this.platform === "win32"
        ? await this.#powershell(
            `$p = ${psLiteral(directory)}\nif (Test-Path -LiteralPath $p) { Get-ChildItem -Force -File -LiteralPath $p | ForEach-Object { [Console]::Out.WriteLine($_.Name) } }`,
          )
        : await this.#posix(["ls", "-1A", "--", directory]);
    if (raw === null) return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  /** No remote keychain is spoken today; Windows credential-manager support would land here. */
  async keychainItems(): Promise<KeychainItem[]> {
    return [];
  }

  /**
   * Retrieves environment variables as a key-value pair object.
   *
   * Returns an object containing environment variable names as keys and their values as strings.
   * Returns null if the platform-specific command fails or no environment variables are found.
   */
  async keychainSecret(): Promise<string | null> {
    return null;
  }

  /** environment implementation. */
  async environment(): Promise<Record<string, string>> {
    const raw =
      this.platform === "win32"
        ? await this.#powershell(
            `foreach ($scope in @('User','Machine')) { foreach ($e in [Environment]::GetEnvironmentVariables($scope).GetEnumerator()) { [Console]::Out.WriteLine($e.Key + '=' + $e.Value) } }`,
          )
        : await this.#posix(["env"]);
    const out: Record<string, string> = {};
    for (const line of (raw ?? "").split(/\r?\n/)) {
      const equals = line.indexOf("=");
      if (equals > 0) out[line.slice(0, equals)] = line.slice(equals + 1);
    }
    return out;
  }

  /** #powershell implementation. */
  async #powershell(script: string): Promise<string | null> {
    const preamble =
      "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='SilentlyContinue';\n";
    const encoded = Buffer.from(preamble + script, "utf16le").toString("base64");
    return runCommand(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        this.#host,
        `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      ],
      this.#timeoutMs,
    );
  }

  /** #posix implementation. */
  async #posix(args: string[]): Promise<string | null> {
    return runCommand(
      "ssh",
      ["-o", "BatchMode=yes", this.#host, args.map(shellQuote).join(" ")],
      this.#timeoutMs,
    );
  }
}
