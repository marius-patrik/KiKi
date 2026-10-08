/**
 * Subscription provider login flows for the Keychain web surface.
 *
 * Each provider that supports RFC 8628 device code authorization gets a
 * device flow configuration. Providers without device flow get a manual
 * token-paste configuration.
 *
 * The device flow is fully self-contained: the server requests a device code,
 * returns the verification URL and user code to the browser, then polls the
 * token endpoint until the user completes authorization. No external CLI is
 * required.
 *
 * @module credentials/login
 */

import { randomBytes } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile, stat, unlink, mkdir } from "node:fs/promises";
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceFlowProvider {
  kind: "device";
  id: string;
  label: string;
  /** The device authorization endpoint (RFC 8628 §3). */
  deviceAuthorizationUrl: string;
  /** The token endpoint for polling and exchanging. */
  tokenUrl: string;
  /** Public client id — not a secret. */
  clientId: string;
  /** Client secret, when required by the provider (e.g. Google). */
  clientSecret?: string;
  /** Scopes to request. */
  scopes: string[];
  /** Extra form parameters sent with the device code request. */
  extraParams?: Record<string, string>;
  /** Extra headers sent with API requests after login. */
  extraHeaders?: Record<string, string>;
  /** How to format the token request body. 'form' = x-www-form-urlencoded, 'json' = application/json. */
  bodyFormat?: "form" | "json";
  /** The vault record ids to write on success. */
  vaultRefs: {
    accessToken: string;
    refreshToken?: string;
    expires?: string;
  };
}

export interface ManualTokenProvider {
  kind: "manual";
  id: string;
  label: string;
  description: string;
  /** The vault record id to write the pasted token into. */
  vaultRef: string;
}

/**
 * CLI-based login: dsh spawns the provider's CLI binary, which opens a browser
 * for OAuth. After the user authenticates, dsh reads the token from the CLI's
 * auth store and imports it into the vault, then cleans up.
 */
export interface CliLoginProvider {
  kind: "cli";
  id: string;
  label: string;
  /** Path to the CLI binary. */
  cliPath: string;
  /** Arguments to pass to the CLI for login. */
  loginArgs: string[];
  /** Working directory for the CLI process (temp dir will be used if undefined). */
  workDir?: string;
  /** How the CLI stores the token after login. */
  tokenSource: CliTokenSource;
  /**
   * Delete the stored credential before spawning, to force a fresh browser
   * flow. Gemini's CLI exits early on a live token; Claude Code overwrites its
   * own entry, so wiping first would only risk destroying a working grant
   * when the flow is abandoned.
   */
  clearBeforeLogin?: boolean;
  /** The vault record id to write the access token into. */
  vaultRefs: {
    accessToken: string;
    refreshToken?: string;
    expires?: string;
  };
  /** Cleanup to run after token is captured (e.g. remove temp dirs). */
  cleanup?: string[];
}

export type CliTokenSource =
  /** Read from a JSON file (e.g. ~/.local/share/opencode/auth.json), extracting a nested key. */
  | { type: "jsonFile"; path: string; keyPath: string[] }
  /** Read from the macOS keychain; see {@link parseKeychainCredentials} for the shapes read. */
  | { type: "keychain"; service: string; account: string };

/** The credential triple a CLI login captures, however the CLI stored it. */
export interface CapturedCredentials {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds or an ISO instant; both are accepted downstream. */
  expiresAt: string;
}

/**
 * Parse a keychain payload into the captured credential triple.
 *
 * Two CLIs, two shapes: gemini writes go-keyring's base64-wrapped
 * `{token:{access_token,...}}`, while Claude Code writes plain
 * `{claudeAiOauth:{accessToken,...}}`. Both are tried, so a keychain source
 * needs no format discriminator.
 * @param raw - the raw secret as `security find-generic-password -w` prints it.
 * @returns the credentials, or null when the payload matches no known shape.
 */
export function parseKeychainCredentials(raw: string): CapturedCredentials | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const prefix = "go-keyring-base64:";
  const decoded = trimmed.startsWith(prefix)
    ? Buffer.from(trimmed.slice(prefix.length), "base64").toString("utf8")
    : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;

  const goKeyring = root["token"];
  if (typeof goKeyring === "object" && goKeyring !== null) {
    const token = goKeyring as Record<string, unknown>;
    if (typeof token["access_token"] === "string") {
      return {
        accessToken: token["access_token"],
        refreshToken: typeof token["refresh_token"] === "string" ? token["refresh_token"] : "",
        expiresAt: typeof token["expiry"] === "string" ? token["expiry"] : "",
      };
    }
  }

  const claudeOauth = root["claudeAiOauth"];
  if (typeof claudeOauth === "object" && claudeOauth !== null) {
    const token = claudeOauth as Record<string, unknown>;
    if (typeof token["accessToken"] === "string") {
      return {
        accessToken: token["accessToken"],
        refreshToken: typeof token["refreshToken"] === "string" ? token["refreshToken"] : "",
        expiresAt: typeof token["expiresAt"] === "number" ? String(token["expiresAt"]) : "",
      };
    }
  }

  return null;
}

const JS_ENTRY_POINT = /\.(?:js|mjs|cjs)$/;

/**
 * Decide how to launch a CLI: as a JavaScript entry point under this Node, or
 * as an executable in its own right.
 *
 * Only a `.js`/`.mjs`/`.cjs` target needs a Node host. Native binaries and
 * shebang scripts are executed directly — handing a native binary to Node
 * fails with ERR_UNKNOWN_FILE_EXTENSION, which is exactly what happened when
 * Claude Code shipped its launcher as a native `claude.exe`.
 * @param cliPath - the configured CLI path, possibly a symlink.
 * @param loginArgs - the CLI's login arguments.
 * @returns the command and argv to spawn.
 */
export function resolveCliInvocation(
  cliPath: string,
  loginArgs: readonly string[],
): { command: string; args: string[] } {
  let target = cliPath;
  try {
    // Follows the whole symlink chain: npm global bins are symlinks, and the
    // extension that decides the answer belongs to the file at the end of it.
    target = realpathSync(cliPath);
  } catch {
    // Unreadable link: fall back to the configured path and let spawn report.
  }
  return JS_ENTRY_POINT.test(target)
    ? { command: process.execPath, args: [target, ...loginArgs] }
    : { command: cliPath, args: [...loginArgs] };
}

export type ProviderLogin = DeviceFlowProvider | ManualTokenProvider | CliLoginProvider;

// ---------------------------------------------------------------------------
// Provider configurations
// ---------------------------------------------------------------------------

export const PROVIDER_LOGINS: ProviderLogin[] = [
  {
    kind: "device",
    id: "grok-sub",
    label: "Grok (Subscription)",
    deviceAuthorizationUrl: "https://auth.x.ai/oauth2/device/code",
    tokenUrl: "https://auth.x.ai/oauth2/token",
    clientId: "b1a00492-073a-47ea-816f-4c329264a828",
    scopes: ["openid", "profile", "email", "offline_access", "grok-cli:access", "api:access"],
    extraParams: { referrer: "dsh" },
    vaultRefs: {
      accessToken: "GROK_SUB_OAUTH_TOKEN",
      refreshToken: "GROK_SUB_REFRESH_TOKEN",
      expires: "GROK_SUB_EXPIRES",
    },
  },
  {
    kind: "cli",
    id: "gemini-sub",
    label: "Gemini (Subscription)",
    cliPath: "/Users/user/.npm-global/bin/gemini",
    loginArgs: [],
    tokenSource: { type: "keychain", service: "gemini", account: "antigravity" },
    clearBeforeLogin: true,
    vaultRefs: {
      accessToken: "GEMINI_SUB_OAUTH_TOKEN",
      refreshToken: "GEMINI_SUB_REFRESH_TOKEN",
      expires: "GEMINI_SUB_EXPIRES",
    },
  },
  {
    kind: "device",
    id: "kimi-sub",
    label: "Kimi (Subscription)",
    deviceAuthorizationUrl: "https://auth.kimi.com/api/oauth/device_authorization",
    tokenUrl: "https://auth.kimi.com/api/oauth/token",
    clientId: "17e5f671-d194-4dfb-9706-5516cb48c098",
    scopes: [],
    vaultRefs: {
      accessToken: "KIMI_SUB_OAUTH_TOKEN",
      refreshToken: "KIMI_SUB_REFRESH_TOKEN",
      expires: "KIMI_SUB_EXPIRES",
    },
  },
  {
    kind: "manual",
    id: "zen",
    label: "OpenCode Zen (API)",
    description:
      "Paste the API key from opencode.ai. Free-tier models work without a" +
      " funded workspace; paid models need a payment method on the workspace.",
    vaultRef: "ZEN_API_KEY",
  },
  {
    kind: "cli",
    id: "claude-sub",
    label: "Claude (Subscription)",
    cliPath: "/Users/user/.npm-global/bin/claude",
    loginArgs: ["auth", "login", "--claudeai"],
    // Claude Code stores its OAuth bundle in the macOS keychain, not in
    // opencode's auth.json — reading that file captured whatever opencode had
    // last written, which is a different (and by now expired) grant.
    tokenSource: { type: "keychain", service: "Claude Code-credentials", account: "user" },
    vaultRefs: {
      accessToken: "CLAUDE_SUB_OAUTH_TOKEN",
      refreshToken: "CLAUDE_SUB_REFRESH_TOKEN",
      expires: "CLAUDE_SUB_EXPIRES",
    },
  },
];

// ---------------------------------------------------------------------------
// Device code request + polling
// ---------------------------------------------------------------------------

export interface DeviceCodeResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

export interface TokenResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/** Request a device code from the provider. */
export async function requestDeviceCode(provider: DeviceFlowProvider): Promise<DeviceCodeResult> {
  const params: Record<string, string> = {
    client_id: provider.clientId,
    scope: provider.scopes.join(" "),
    ...provider.extraParams,
  };
  if (provider.clientSecret) params.client_secret = provider.clientSecret;
  const isJson = provider.bodyFormat === "json";
  const response = await fetch(provider.deviceAuthorizationUrl, {
    method: "POST",
    headers: {
      "content-type": isJson ? "application/json" : "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: isJson ? JSON.stringify(params) : new URLSearchParams(params).toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `device code request failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const json = (await response.json()) as DeviceCodeResult;
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error("device code response is missing device_code / user_code / verification_uri");
  }
  return json;
}

/** Poll the token endpoint for the device code result. Returns null while pending. */
export async function pollDeviceToken(
  provider: DeviceFlowProvider,
  deviceCode: string,
): Promise<TokenResult | null> {
  const params: Record<string, string> = {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: deviceCode,
    client_id: provider.clientId,
  };
  if (provider.clientSecret) params.client_secret = provider.clientSecret;
  const isJson = provider.bodyFormat === "json";
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": isJson ? "application/json" : "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: isJson ? JSON.stringify(params) : new URLSearchParams(params).toString(),
  });
  if (response.ok) {
    return (await response.json()) as TokenResult;
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const error = body.error;
  if (error === "authorization_pending" || error === "slow_down") {
    return null;
  }
  if (error === "access_denied" || error === "authorization_denied") {
    throw new Error("authorization was denied");
  }
  if (error === "expired_token") {
    throw new Error("device code expired — please try again");
  }
  if (error) {
    throw new Error(`token exchange failed: ${error}`);
  }
  throw new Error(`token exchange failed (HTTP ${response.status})`);
}

/** Generate a random state string for CSRF protection. */
export function generateState(): string {
  return randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// CLI-based login: spawn the provider binary, capture the resulting token
// ---------------------------------------------------------------------------

/** Active CLI login sessions, keyed by a random session token. */
const cliSessions = new Map<
  string,
  {
    provider: CliLoginProvider;
    process: ChildProcess | null;
    mtimeBefore: number | null;
    authFilePath: string;
    startedAt: number;
    completed: boolean;
    error?: string;
    capturedToken?: string;
    capturedFull?: { accessToken: string; refreshToken: string; expiresAt: string };
    /** OAuth URL extracted from CLI stdout (for opening the browser). */
    authUrl?: string;
    /** Whether the browser has been opened. */
    browserOpened?: boolean;
    /** Whether the CLI is waiting for code paste. */
    waitingForCode?: boolean;
  }
>();

/** Poll interval for checking token file changes (ms). */
const CLI_POLL_INTERVAL = 2000;
/** Maximum time to wait for CLI login (10 minutes). */
const CLI_TIMEOUT_MS = 10 * 60 * 1000;

/** Find a session by its process reference. */
function findSessionByProcess(proc: ChildProcess) {
  for (const session of cliSessions.values()) {
    if (session.process === proc) return session;
  }
  return null;
}

/** Get the auth file path for a CLI provider's token source. */
function getAuthFilePath(source: CliTokenSource): string {
  if (source.type === "jsonFile") {
    return source.path.replace("~", homedir());
  }
  return "";
}

/** Read a keychain secret, or null when the item is absent. */
async function readKeychainSecret(service: string, account: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const proc = spawn("security", ["find-generic-password", "-s", service, "-a", account, "-w"]);
    let output = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      resolve(code === 0 ? output.trim() : null);
    });
    proc.on("error", () => resolve(null));
  });
}

/** Read a token from a CLI provider's auth store. */
// jscpd:ignore-start -- internal near-duplicate per-provider OAuth login flow blocks; each provider's flow is independently editable by design
async function readCliToken(provider: CliLoginProvider): Promise<string | null> {
  const source = provider.tokenSource;
  try {
    if (source.type === "jsonFile") {
      const content = await readFile(getAuthFilePath(source), "utf8");
      const data = JSON.parse(content);
      // Traverse keyPath to find the token
      let current: unknown = data;
      for (const key of source.keyPath) {
        // jscpd:ignore-end
        if (current === null || current === undefined || typeof current !== "object") return null;
        current = (current as Record<string, unknown>)[key];
      }
      return typeof current === "string" ? current : null;
    }
    if (source.type === "keychain") {
      const raw = await readKeychainSecret(source.service, source.account);
      if (raw === null) return null;
      return parseKeychainCredentials(raw)?.accessToken ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Read the full token info (access, refresh, expiry) from a CLI provider's auth store. */
async function readCliTokenFull(
  provider: CliLoginProvider,
  // jscpd:ignore-start -- internal near-duplicate per-provider OAuth login flow blocks; each provider's flow is independently editable by design
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string } | null> {
  const source = provider.tokenSource;
  try {
    if (source.type === "jsonFile") {
      const content = await readFile(getAuthFilePath(source), "utf8");
      const data = JSON.parse(content);
      // For jsonFile, read the full record at the first key level
      let current: unknown = data;
      for (const key of source.keyPath.slice(0, -1)) {
        // jscpd:ignore-end
        if (current === null || current === undefined || typeof current !== "object") return null;
        current = (current as Record<string, unknown>)[key];
      }
      if (typeof current !== "object" || current === null) return null;
      const record = current as Record<string, unknown>;
      const accessToken = record["access"];
      const refreshToken = record["refresh"];
      const expires = record["expires"];
      if (typeof accessToken !== "string") return null;
      return {
        accessToken,
        refreshToken: typeof refreshToken === "string" ? refreshToken : "",
        expiresAt:
          typeof expires === "number"
            ? new Date(expires).toISOString()
            : typeof expires === "string"
              ? expires
              : "",
      };
    }
    if (source.type === "keychain") {
      const raw = await readKeychainSecret(source.service, source.account);
      if (raw === null) return null;
      return parseKeychainCredentials(raw);
    }
  } catch {
    return null;
  }
  return null;
}

/** Start a CLI login session. Returns a session token for polling. */
export async function startCliLogin(
  provider: CliLoginProvider,
): Promise<{ sessionToken: string; message: string }> {
  const sessionToken = randomBytes(16).toString("hex");
  const authFilePath = getAuthFilePath(provider.tokenSource);

  // Record the mtime of the auth file before starting (to detect changes)
  let mtimeBefore: number | null = null;
  if (authFilePath) {
    try {
      const stats = statSync(authFilePath, { throwIfNoEntry: false });
      if (stats !== undefined) mtimeBefore = stats.mtimeMs;
    } catch {
      /* file doesn't exist yet */
    }
  }

  // Pre-login step: clear stale auth so the CLI triggers a fresh browser flow
  if (provider.tokenSource.type === "keychain" && provider.clearBeforeLogin === true) {
    try {
      const proc = spawn("security", [
        "delete-generic-password",
        "-s",
        provider.tokenSource.service,
        "-a",
        provider.tokenSource.account,
      ]);
      await new Promise<void>((resolve) => {
        proc.on("close", () => resolve());
        proc.on("error", () => resolve());
      });
    } catch {
      /* best effort */
    }
  }

  // Create temp working directory
  const workDir = `/tmp/dsh-cli-login-${sessionToken.slice(0, 8)}`;
  await mkdir(workDir, { recursive: true });

  // Spawn the CLI as itself or under node, depending on what it actually is.
  const { command: spawnCmd, args: spawnArgs } = resolveCliInvocation(
    provider.cliPath,
    provider.loginArgs,
  );

  // Spawn the CLI binary with piped stdio so we can capture the OAuth URL
  // and open the browser ourselves. For gemini (TUI app), use `script` as
  // a PTY wrapper so Ink can render.
  // `script` is a PTY wrapper so an Ink TUI renders — but macOS `script` puts
  // its OWN stdin in raw mode, so it aborts with
  // "tcgetattr/ioctl: Operation not supported on socket" whenever stdin is not
  // a terminal. Inside the web server it never is, which made the wrapper fail
  // every time it was used. Use it only when this process actually has a
  // terminal to lend; otherwise spawn the CLI directly, where the URL is still
  // parsed from piped stdout exactly as before.
  const usePty = provider.id === "gemini-sub" && process.stdin.isTTY === true;
  const proc = usePty
    ? spawn("script", ["-q", "/dev/null", spawnCmd, ...spawnArgs], {
        cwd: workDir,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, HOME: homedir(), TERM: "xterm-256color" },
      })
    : spawn(spawnCmd, spawnArgs, {
        cwd: workDir,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        // A non-TTY child must not try to drive a full-screen renderer: CI=1
        // and a dumb terminal make Ink fall back to plain line output, which is
        // what the URL detection below reads.
        env: {
          ...process.env,
          HOME: homedir(),
          ...(provider.id === "gemini-sub" ? { CI: "1", TERM: "dumb" } : {}),
        },
      });
  proc.unref();

  // Capture stdout to detect the OAuth URL and open the browser
  let stdoutBuf = "";
  let authUrlOpened = false;
  proc.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stdoutBuf += text;

    // Detect OAuth URL in the output — Claude outputs it after "visit:"
    // Format: ]8;;<url><url>]8;; (OSC 8 hyperlinks) or plain URL
    const urlMatch = stdoutBuf.match(/(https:\/\/claude\.com\/cai\/oauth\/authorize\?[^\s]+)/);
    if (urlMatch && !authUrlOpened) {
      authUrlOpened = true;
      const session = findSessionByProcess(proc);
      if (session) {
        session.authUrl = urlMatch[1]!;
        session.browserOpened = true;
      }
      // Open the browser
      const url = urlMatch[1]!;
      execFile("open", [url], (_err) => {
        /* best effort */
      });
    }

    // Detect "Paste code here" prompt — the CLI is waiting for input
    if (stdoutBuf.includes("Paste code here") || stdoutBuf.includes("paste the code")) {
      const session = findSessionByProcess(proc);
      if (session) session.waitingForCode = true;
    }
  });

  // Also capture stderr for error detection
  let stderrBuf = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  // Handle process exit
  proc.on("close", (code) => {
    const session = findSessionByProcess(proc);
    if (session && !session.completed) {
      // If process exited with error and no token was captured, mark as error
      if (code !== 0 && !session.capturedToken) {
        session.error = `CLI exited with code ${code}${stderrBuf ? ": " + stderrBuf.slice(0, 200) : ""}`;
        session.completed = true;
      }
    }
  });

  cliSessions.set(sessionToken, {
    provider,
    process: proc,
    mtimeBefore,
    authFilePath,
    startedAt: Date.now(),
    completed: false,
  });

  // Auto-expire after timeout
  setTimeout(() => {
    const session = cliSessions.get(sessionToken);
    if (session && !session.completed) {
      session.error = "Login timed out";
      session.completed = true;
    }
  }, CLI_TIMEOUT_MS);

  return {
    sessionToken,
    message: `Complete the login in the browser window that opened. The ${provider.label} CLI is handling authentication.`,
  };
}

export interface CliLoginStatus {
  status: "pending" | "authenticated" | "error" | "waiting_for_code";
  error?: string;
  /** OAuth URL to open in the browser. Only set when status is 'waiting_for_code'. */
  authUrl?: string;
  /** Whether the browser has been opened. */
  browserOpened?: boolean | undefined;
}

/** Poll a CLI login session for completion. */
export async function pollCliLogin(sessionToken: string): Promise<CliLoginStatus> {
  const session = cliSessions.get(sessionToken);
  if (!session) return { status: "error", error: "Invalid or expired session" };
  if (session.error) return { status: "error", error: session.error };

  // If the CLI is waiting for code paste, report that status with the auth URL
  if (session.waitingForCode && session.authUrl) {
    return {
      status: "waiting_for_code",
      authUrl: session.authUrl,
      browserOpened: session.browserOpened,
    };
  }

  // Check if the auth file changed
  if (session.authFilePath) {
    try {
      const s = await stat(session.authFilePath);
      // jscpd:ignore-start -- internal near-duplicate per-provider OAuth login flow blocks; each provider's flow is independently editable by design
      if (session.mtimeBefore === null || s.mtimeMs > session.mtimeBefore) {
        // File changed — try to read the token
        const full = await readCliTokenFull(session.provider);
        if (full && full.accessToken.length > 10) {
          session.completed = true;
          session.capturedToken = full.accessToken;
          session.capturedFull = full;
          return { status: "authenticated" };
        }
      }
      // jscpd:ignore-end
    } catch {
      /* file doesn't exist yet or can't stat */
    }
  }

  // For keychain-based providers (gemini), try reading directly
  // jscpd:ignore-start -- internal near-duplicate per-provider OAuth login flow blocks; each provider's flow is independently editable by design
  if (session.provider.tokenSource.type === "keychain" && !session.completed) {
    const full = await readCliTokenFull(session.provider);
    if (full && full.accessToken.length > 10) {
      session.completed = true;
      session.capturedToken = full.accessToken;
      session.capturedFull = full;
      return { status: "authenticated" };
    }
  }
  // jscpd:ignore-end

  // Check timeout
  if (Date.now() - session.startedAt > CLI_TIMEOUT_MS) {
    session.error = "Login timed out";
    session.completed = true;
    return { status: "error", error: "Login timed out" };
  }

  return { status: "pending" };
}

/** Submit an authorization code to a CLI login session (piped to CLI stdin). */
export async function submitCliAuthCode(sessionToken: string, code: string): Promise<boolean> {
  const session = cliSessions.get(sessionToken);
  if (!session || !session.process?.stdin || session.completed) return false;
  try {
    session.process.stdin.write(code + "\n");
    session.waitingForCode = false;
    return true;
  } catch {
    return false;
  }
}

/** Get the captured token and clean up a CLI login session. */
export async function completeCliLogin(sessionToken: string): Promise<{
  token: string;
  full: { accessToken: string; refreshToken: string; expiresAt: string } | undefined;
  provider: CliLoginProvider;
} | null> {
  const session = cliSessions.get(sessionToken);
  if (!session || !session.completed || !session.capturedToken) return null;
  const token = session.capturedToken;
  const full = session.capturedFull;
  const provider = session.provider;

  // Clean up
  try {
    session.process?.kill();
  } catch {
    /* already dead */
  }
  cliSessions.delete(sessionToken);

  return { token, full, provider };
}
