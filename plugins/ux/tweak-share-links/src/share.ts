/**
 * tweaks share links: a self-hosted read-only snapshot route. The plugin
 * registers `<basePath>/<id>` as a prefix route on the harness web server;
 * the handler reads the session's durable JSONL log and renders a static,
 * dependency-free HTML transcript. Interactive mode (opt-in) additionally
 * requires `?token=<random>` in the URL, checked against the value the
 * `dsh share` verb wrote to the section. Read-only is the default: without a
 * token the page is a pure snapshot with no interactive controls.
 * @module tweak-share-links/share
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { join, dirname, basename } from "node:path";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { zstdDecompressSync } from "node:zlib";
import { createHash, randomBytes } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { ShareConfig } from "./settings.js";

/** Length of the interactive token, in bytes. */
const TOKEN_BYTES = 24;

/** One rendered transcript line from a session event. */
export interface TranscriptLine {
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  time?: string;
}

/** The session-log folder name under the home. */
const SESSIONS_DIR = "sessions";

/** Map a workspace-cwd segment to the session folder prefix the harness uses. */
function workspaceSegment(cwd: string): string {
  const cleaned = cwd.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
  return `--${cleaned}--`;
}

/** Candidate log paths under one workspace directory. */
function logCandidates(sessionDir: string): string[] {
  return [
    join(sessionDir, "session.jsonl.zstd"),
    join(sessionDir, "session.jsonl.ln"),
    join(sessionDir, "session.jsonl"),
  ];
}

/** Search every workspace segment under `sessions/` for the session's log. */
export async function resolveSessionLogPath(
  home: string,
  sessionId: string,
  cwd = "",
): Promise<string | undefined> {
  const root = join(home, SESSIONS_DIR);
  // Accept the id with or without the `session-` prefix.
  const bare = sessionId.startsWith("session-") ? sessionId.slice("session-".length) : sessionId;
  // Preferred first: the workspace segment derived from cwd.
  const preferred = cwd.length > 0 ? cwd : process.cwd();
  const dirs = [join(root, workspaceSegment(preferred))];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("--")) continue;
      const dir = join(root, entry.name);
      if (!dirs.includes(dir)) dirs.push(dir);
    }
  } catch {
    // sessions/ missing entirely: nothing to find
  }
  for (const dir of dirs) {
    const sessionDir = join(dir, `session-${bare}`);
    for (const candidate of logCandidates(sessionDir)) {
      try {
        const stat = await import("node:fs/promises").then((fs) => fs.stat(candidate));
        if (stat.isFile()) return candidate;
      } catch {
        // try the next candidate
      }
    }
  }
  return undefined;
}

/** Extract role/text from one parsed JSONL event line. */
function eventToLine(event: Record<string, unknown>): TranscriptLine | undefined {
  const type = event["type"];
  const data = event["data"] as Record<string, unknown> | undefined;
  if (type === "user/message") {
    const message = data?.["message"] as Record<string, unknown> | undefined;
    const content = message?.["content"];
    return { role: "user", text: renderContent(content) };
  }
  if (type === "assistant/message") {
    const message = data?.["message"] as Record<string, unknown> | undefined;
    const content = message?.["content"];
    return { role: "assistant", text: renderContent(content) };
  }
  if (type === "tool/call") {
    const name = data?.["name"];
    return { role: "tool", text: `tool: ${String(name ?? "unknown")}` };
  }
  if (type === "tool/result") {
    const ok = data?.["ok"];
    return { role: "tool", text: `tool result: ${String(ok ?? "?")}` };
  }
  return undefined;
}

/** Render message content (string, array of parts, or absent) to plain text. */
function renderContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const p = part as Record<string, unknown>;
        if (typeof p["text"] === "string") return p["text"];
        if (p["type"] === "image") return "[image]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Parse a durable JSONL log into transcript lines (stops at the first bad line). */
export function parseLog(text: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      break;
    }
    const line = eventToLine(event);
    if (line !== undefined) lines.push(line);
  }
  return lines;
}

/** Escape a string for safe HTML text emission. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render a full share page from transcript lines. */
export function renderSharePage(
  sessionId: string,
  lines: TranscriptLine[],
  interactive: boolean,
): string {
  const rows = lines
    .map((line) => {
      const cls = line.role;
      const text = escapeHtml(line.text);
      const time = line.time === undefined ? "" : `<time>${escapeHtml(line.time)}</time>`;
      return `<div class="row ${cls}"><div class="role">${cls}</div><div class="text">${text}</div>${time}</div>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>session ${escapeHtml(sessionId)}</title>
<style>
body { font: 14px/1.6 system-ui, sans-serif; margin: 0; padding: 2rem; background: #101418; color: #d6dee8; }
h1 { font-size: 1rem; color: #8b97a6; }
.row { display: grid; grid-template-columns: 6rem 1fr auto; gap: .75rem; padding: .5rem 0; border-bottom: 1px solid #222a33; }
.role { color: #8b97a6; text-transform: uppercase; font-size: .75rem; padding-top: .2rem; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
time { color: #5b6673; font-size: .75rem; }
${interactive ? "body { padding-bottom: 5rem; } #live { position: fixed; bottom: 1rem; left: 2rem; right: 2rem; display: flex; gap: .5rem; } #live input { flex: 1; padding: .5rem; } #live button { padding: .5rem 1rem; }" : ""}
</style>
</head>
<body>
<h1>session ${escapeHtml(sessionId)}</h1>
${rows}
</body>
</html>
`;
}

/** Constant-time token comparison. */
export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return ha.equals(hb);
}

/** Generate a fresh interactive token. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Store a share token beside the home settings (the `dsh share` verb writes this). */
export async function writeShareToken(home: string, token: string): Promise<string> {
  const path = join(home, "share.token");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${token}\n`, { mode: 0o600 });
  return path;
}

/** Read the stored share token, or `undefined` when sharing is read-only. */
export async function readShareToken(home: string): Promise<string | undefined> {
  try {
    const text = await readFile(join(home, "share.token"), "utf8");
    return text.trim();
  } catch {
    return undefined;
  }
}

/** List session id directories under a workspace segment. */
export async function listSessionIds(home: string, cwd = ""): Promise<string[]> {
  const workspace = cwd.length > 0 ? cwd : process.cwd();
  const dir = join(home, SESSIONS_DIR, workspaceSegment(workspace));
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("session-"))
      .map((entry) => basename(entry.name).slice("session-".length));
  } catch {
    return [];
  }
}

/** Read a session log, transparently decompressing a `.zstd` frame. */
async function readSessionLog(logPath: string): Promise<string> {
  const raw = await readFile(logPath);
  if (logPath.endsWith(".zstd")) {
    return zstdDecompressSync(raw).toString("utf8");
  }
  return raw.toString("utf8");
}

/**
 * Build the route handler for one share base path. Read-only by default;
 * interactive only when `allowInteractive` and the request carries the
 * matching token.
 */
export function makeShareHandler(
  home: string,
  basePath: string,
  allowInteractive = false,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const pathname = url.pathname;
    const id = pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length + 1) : "";
    if (id.length === 0 || id.includes("/")) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const logPath = await resolveSessionLogPath(home, id);
    if (logPath === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const interactive =
      allowInteractive && (await authorizeShare(home, url.searchParams.get("token")));
    const text = await readSessionLog(logPath);
    const lines = parseLog(text);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderSharePage(id, lines, interactive));
  };
}

/** Whether an interactive request is authorized (token matches the stored one). */
async function authorizeShare(home: string, token: string | null): Promise<boolean> {
  if (token === null || token.length === 0) return false;
  const stored = await readShareToken(home);
  if (stored === undefined) return false;
  return tokensEqual(stored, token);
}

/**
 * Mount the share prefix route on the web server (called from `apply`).
 * Returns the inject fiber.
 */
export function mountShareRoute(ctx: Context, home: string, config: ShareConfig): unknown {
  if (!config.enabled) return undefined;
  const basePath = config.basePath === "" ? "/share" : config.basePath;
  return ctx.inject(["webServer"], (httpCtx) => {
    return httpCtx.webServer.register({
      kind: "prefix",
      path: basePath,
      handler: makeShareHandler(home, basePath, config.allowInteractive),
    });
  });
}
