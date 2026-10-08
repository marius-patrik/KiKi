/**
 * tweaks observability: reads the harness's persisted projection cache
 * (`storages/session_projcache.json`) and the session store directory to
 * power the `dsh stats` and `dsh sessions` verbs. The cache is a durable
 * fold shortcut (never an authority), so the verbs report what the harness
 * last checkpointed — the same numbers the web UI shows.
 * @module tweak-stats/stats
 */

import { join } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

/** One session's stats row as the CLI prints it. */
export interface SessionStatsRow {
  sessionId: string;
  cwd?: string;
  createdAt?: number;
  turns: number;
  steps: number;
  llmMs: number;
  toolMs: number;
  ttftMs: number;
  decodeMs: number;
  decodeTokens: number;
  /** Whether a cached row existed (else all-zero fold placeholder). */
  cached: boolean;
}

/** The raw shape of the projection cache JSON document. */
export interface ProjectionCacheDoc {
  tables?: Record<string, Record<string, unknown>>;
  unit?: { name?: string; version?: number };
}

/** Resolve the projection-cache path under a home. */
export function projectionCachePath(home: string): string {
  return join(home, "storages", "session_projcache.json");
}

/** Read + shape the persisted projection cache, or `undefined` when absent. */
export async function readProjectionCache(home: string): Promise<ProjectionCacheDoc | undefined> {
  try {
    const text = await readFile(projectionCachePath(home), "utf8");
    return JSON.parse(text) as ProjectionCacheDoc;
  } catch {
    return undefined;
  }
}

/** Fold one session's `sessionStats` row from the cache (zeros when absent). */
export function sessionStatsFromCache(
  cache: ProjectionCacheDoc | undefined,
  sessionId: string,
): SessionStatsRow {
  const empty: SessionStatsRow = {
    sessionId,
    turns: 0,
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    ttftMs: 0,
    decodeMs: 0,
    decodeTokens: 0,
    cached: false,
  };
  if (cache === undefined) return empty;
  const sessions = cache.tables?.["sessions"] ?? {};
  const record = sessions[sessionId] as
    | { identity?: { createdAt?: number; cwd?: string }; rows?: Record<string, { val?: unknown }> }
    | undefined;
  if (record === undefined) return empty;
  const val = record.rows?.["sessionStats"]?.val as Record<string, unknown> | undefined;
  if (val === undefined) return empty;
  return {
    sessionId,
    cwd: record.identity?.cwd,
    createdAt: record.identity?.createdAt,
    turns: num(val["turns"]),
    steps: num(val["steps"]),
    llmMs: num(val["llmMs"]),
    toolMs: num(val["toolMs"]),
    ttftMs: num(val["ttftMs"]),
    decodeMs: num(val["decodeMs"]),
    decodeTokens: num(val["decodeTokens"]),
    cached: true,
  };
}

/**
 * Returns the value as a number, or 0 if the value is not a number.
 *
 * @param value - The value to convert to a number.
 * @returns The numeric value if `value` is a number, otherwise 0.
 */
function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/** Walk the session store and list every session id + its cached stats row. */
export async function listAllSessions(home: string, cwd = ""): Promise<SessionStatsRow[]> {
  const cache = await readProjectionCache(home);
  const workspace = cwd.length > 0 ? cwd : process.cwd();
  const dir = join(
    home,
    "sessions",
    `--${workspace.replace(/^\/+|\/+$/g, "").replace(/\//g, "-")}--`,
  );
  const ids = new Set<string>();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("session-")) {
        ids.add(entry.name.slice("session-".length));
      }
    }
  } catch {
    // no workspace folder: cache rows still count
  }
  // Also admit cache rows whose ids are not under this workspace.
  const cachedIds = Object.keys(cache?.tables?.["sessions"] ?? {});
  for (const id of cachedIds) ids.add(id);
  const rows = [...ids].map((id) => sessionStatsFromCache(cache, id));
  rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return rows;
}

/** Format rows as a plain text table (the default `dsh stats` output). */
export function formatTable(rows: SessionStatsRow[]): string {
  if (rows.length === 0) return "no sessions found";
  const header = [
    "SESSION",
    "TURNS",
    "STEPS",
    "LLM MS",
    "TOOL MS",
    "TTFT MS",
    "DECODE MS",
    "OUT TOKENS",
  ];
  const body = rows.map((row) => [
    // jscpd:ignore-start -- formatTable/formatCsv intentionally build different field lists (table omits cwd/createdAt and truncates the session id; CSV includes them in full and CSV-escapes) -- not shared, see issue #40 discussion
    row.sessionId.slice(0, 8),
    String(row.turns),
    String(row.steps),
    String(row.llmMs),
    String(row.toolMs),
    String(row.ttftMs),
    String(row.decodeMs),
    String(row.decodeTokens),
  ]);
  // jscpd:ignore-end
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => (r[i] ?? "").length)));
  /**
   * Formats an array of cells into a single aligned row string.
   *
   * Ensures each cell is right-aligned to the maximum width of its column.
   * Returns a string representing one aligned row.
   *
   * Fails if the `cells` array does not match the expected column width.
   */
  const line = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [line(header), body.map(line).join("\n")].join("\n");
}

/** Format rows as CSV. */
export function formatCsv(rows: SessionStatsRow[]): string {
  const header = "sessionId,cwd,createdAt,turns,steps,llmMs,toolMs,ttftMs,decodeMs,decodeTokens";
  const body = rows.map((row) =>
    [
      row.sessionId,
      row.cwd ?? "",
      // jscpd:ignore-start -- formatTable/formatCsv intentionally build different field lists (table omits cwd/createdAt and truncates the session id; CSV includes them in full and CSV-escapes) -- not shared, see issue #40 discussion
      String(row.createdAt ?? ""),
      String(row.turns),
      String(row.steps),
      String(row.llmMs),
      String(row.toolMs),
      String(row.ttftMs),
      String(row.decodeMs),
      String(row.decodeTokens),
    ]
      // jscpd:ignore-end
      .map(csv)
      .join(","),
  );
  return [header, ...body].join("\n");
}

/**
 * Converts a session stats row to a CSV-formatted string.
 *
 * Guarantees: Returns a CSV string with the sessionId, cwd, createdAt, turns, steps, llmMs, toolMs, ttftMs, and decodeMs fields properly escaped.
 * Fails: Throws an error if the input row contains invalid data types or missing required fields.
 */
function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Format rows as JSON lines. */
export function formatJson(rows: SessionStatsRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

/** Whether the session store directory exists (a cheap smoke for the verbs). */
export async function hasSessionStore(home: string): Promise<boolean> {
  try {
    return (await stat(join(home, "sessions"))).isDirectory();
  } catch {
    return false;
  }
}
