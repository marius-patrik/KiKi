import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Fallback port when neither the profile patch nor the server log pins one. */
export const DEFAULT_PORT = 3080;

const GATEWAY_PATTERN = /dsh gateway:\s*https?:\/\/[^\s:/]+:(\d+)/g;
const WEB_PATTERN = /dsh web:\s*https?:\/\/[^\s:/]+:(\d+)/g;
const LAUNCH_TOKEN_PATTERN = /dsh web:\s*https?:\/\/[^\s]+\?token=([A-Za-z0-9_-]+)/g;

/** Last valid port captured by `pattern` in the log, or null. */
function parseLastPort(logText: string, pattern: RegExp): number | null {
  let port: number | null = null;
  for (const match of logText.matchAll(pattern)) {
    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) port = parsed;
  }
  return port;
}

/**
 * Parse the gateway/API port from the log: the last valid
 * `dsh gateway: http://<host>:<port>` line wins. Returns null when the log
 * holds no such line.
 */
export function parseGatewayPort(logText: string): number | null {
  return parseLastPort(logText, GATEWAY_PATTERN);
}

/**
 * Parse the current launch token from the log: the last `dsh web:
 * http://<host>:<port>/?token=<value>` line wins, matching every other
 * "last boot wins" parse in this module. Harness's boot flow (since the
 * harness bump in #218) prints this line once per process start; the same
 * token authenticates a `/?token=...` exchange for ANY Host the request
 * carries (harness's browser-auth.ts only checks the token value, not the
 * authority, at exchange time -- authority-binding happens on the cookie it
 * mints afterward), so it can be reused to build a working link for a host
 * the boot line itself never printed (e.g. a Tailscale address). Returns
 * null when the log holds no such line, or once the server that printed it
 * has restarted and rotated to a new token.
 */
export function parseLaunchToken(logText: string): string | null {
  let token: string | null = null;
  for (const match of logText.matchAll(LAUNCH_TOKEN_PATTERN)) {
    if (match[1] !== undefined) token = match[1];
  }
  return token;
}

/**
 * Parse the port the web server actually bound from its own startup output.
 * `@dsh-stack/hosts` prints a `dsh gateway: http://127.0.0.1:<port>` line
 * naming the gateway/API port that external consumers (Tailscale serve, the
 * documented default) actually need; when present it always wins over the
 * harness's own `dsh web: http://<host>:<port>` line, which names the
 * web-asset port instead and has caused real confusion (dsh-stack#182).
 * When the log holds several of the same kind of line (across restarts) the
 * last one wins. Returns null when neither line is present.
 */
export function parseBoundPort(logText: string): number | null {
  return parseGatewayPort(logText) ?? parseLastPort(logText, WEB_PATTERN);
}

/**
 * Read the port pinned for the `webserver` plugin in a profile's
 * cordis.patch.yml (`<home>/profiles/<profile>/cordis.patch.yml`). Line-based
 * and tolerant: finds the `- id: webserver` entry and the first `port:` key
 * inside it. Returns null when the file, entry, or key is absent.
 */
export function readProfilePort(home: string, profile: string): number | null {
  let lines: string[];
  try {
    lines = readFileSync(join(home, "profiles", profile, "cordis.patch.yml"), "utf8").split("\n");
  } catch {
    return null;
  }
  let inEntry = false;
  for (const line of lines) {
    if (/^\s*-\s+id\s*:/.test(line)) {
      inEntry = /^\s*-\s+id\s*:\s*['"]?webserver['"]?\s*$/.test(line);
      continue;
    }
    if (!inEntry) continue;
    const match = line.match(/^\s+port\s*:\s*(\d+)\s*$/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
      return null;
    }
  }
  return null;
}

/**
 * Resolve the port the web server is expected on, for status/stop checks:
 * a `dsh gateway` line in the log is runtime truth — it names the port
 * external consumers actually reach, which the profile patch cannot know
 * after a restart on a different gateway port — so it wins over everything
 * (dsh-stack#182); the profile patch is next; the last bound port in the log
 * covers servers started with a non-default port and no patch; DEFAULT_PORT
 * is the final fallback.
 */
export function resolvePort(home: string, profile: string, logFile: string): number {
  let logText = "";
  try {
    logText = readFileSync(logFile, "utf8");
  } catch {
    /* no log yet */
  }
  const gateway = parseGatewayPort(logText);
  if (gateway !== null) return gateway;
  const patched = readProfilePort(home, profile);
  if (patched !== null) return patched;
  const fromLog = parseBoundPort(logText);
  if (fromLog !== null) return fromLog;
  return DEFAULT_PORT;
}

/**
 * Resolve the port hint used when starting the server: the profile patch when
 * present, else the default. The log is deliberately not consulted — it may
 * hold a stale port from an older configuration. The actually bound port is
 * learned from the server's own startup line after spawn (see parseBoundPort).
 */
export function startPortHint(home: string, profile: string): number {
  return readProfilePort(home, profile) ?? DEFAULT_PORT;
}
