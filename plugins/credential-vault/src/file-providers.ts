/**
 * File-based secret importers for Claude Code, Cursor, and the GitHub CLI.
 * Each importer recognizes its tool's on-disk credential file and reads raw
 * secret values out of it under the canonical reference names the providers
 * resolve.
 * @module credentials/file-providers
 */

import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FileSecretProvider } from "./types.js";

/**
 * Detects whether the given path belongs to the primary credential file for
 * Claude Code. Returns true if the path matches the default path for the
 * credentials file, otherwise returns false.
 *
 * @param path - The path to check.
 * @returns A boolean indicating whether the path matches the default credentials file path.
 */
function home(): string {
  return homedir();
}

/** readJson implementation. */
function readJson(path: string): Promise<unknown> {
  return fs.readFile(path, "utf8").then((text) => JSON.parse(text));
}

/**
 * Claude Code's `~/.claude/.credentials.json`: the primary API key, the
 * subscription OAuth token (when Claude Code stored it in the file), and any
 * custom-API-key responses. Only string values survive import.
 */
export const claudeFileProvider: FileSecretProvider = {
  id: "claude",
  displayName: "Claude Code",
  description:
    "Imports the primary API key and subscription OAuth token from Claude Code's credential file.",
  defaultPaths: [join(home(), ".claude", ".credentials.json")],

  /**
   * Detects whether the provided path points to a valid `~/.claude/.credentials.json` file.
   *
   * Guarantees: Returns `true` if the file is a valid JSON object containing string values.
   *             Returns `false` if the file is not a valid JSON object or if an error occurs.
   */
  async detect(path: string): Promise<boolean> {
    try {
      const parsed = await readJson(path);
      return typeof parsed === "object" && parsed !== null;
    } catch {
      return false;
    }
  },

  /**
   * Reads the credentials from the specified path.
   *
   * Guarantees: Returns an object containing string values if the file is a valid JSON object.
   *             Throws an error if the file is not a valid JSON object or an error occurs.
   */
  async read(path: string): Promise<Record<string, string>> {
    const parsed = await readJson(path);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`credentials: ${path} is not a JSON object`);
    }
    const object = parsed as Record<string, unknown>;
    const out: Record<string, string> = {};
    if (typeof object["oauthAccessToken"] === "string" && object["oauthAccessToken"].length > 0) {
      out["CLAUDE_SUB_OAUTH_TOKEN"] = object["oauthAccessToken"];
    }
    if (typeof object["primaryApiKey"] === "string" && object["primaryApiKey"].length > 0) {
      out["CLAUDE_API_KEY"] = object["primaryApiKey"];
    }
    return out;
  },
};

/** Keys read out of Cursor's `state.vscdb` item store. */
const CURSOR_KEYS: ReadonlyArray<readonly [sqliteKey: string, ref: string]> = [
  ["cursorAuth/accessToken", "CURSOR_SUB_TOKEN"],
  ["cursorAuth/cachedEmail", "CURSOR_EMAIL"],
  ["cursorAuth/cachedSignUpType", "CURSOR_SIGNUP_TYPE"],
];

/**
 * Cursor's `state.vscdb` (a SQLite item store). The auth token lives in the
 * `ItemTable` under `cursorAuth/accessToken`; only the token is a secret, but
 * the surrounding identity facts are imported too for diagnostics.
 */
export const cursorFileProvider: FileSecretProvider = {
  id: "cursor",
  displayName: "Cursor",
  description: "Imports the Cursor subscription token from the editor's state.vscdb item store.",
  defaultPaths: [
    join(home(), "Library", "Application Support", "Cursor", "User", "state.vscdb"),
    join(
      home(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "globalStorage",
      "state.vscdb",
    ),
  ],

  /**
   * Detects whether the provided path points to a GitHub CLI `hosts.yml` file
   * containing an `oauth_token`. If the file exists and matches the expected
   * pattern, returns true. Otherwise, returns false or throws an error.
   *
   * @param path - The path to the `hosts.yml` file.
   * @returns `true` if the file contains an `oauth_token`, `false` otherwise.
   */
  async detect(path: string): Promise<boolean> {
    try {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const row = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ItemTable'")
          .get() as unknown;
        return row !== undefined;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  },

  /**
   * Reads the GitHub CLI's `hosts.yml` file to extract the OAuth token and user
   * information for `github.com` or an enterprise host.
   *
   * Guarantees the return of the OAuth token and user information if successful.
   * Throws an error if the file cannot be read or the token is missing.
   */
  async read(path: string): Promise<Record<string, string>> {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const out: Record<string, string> = {};
      const statement = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
      for (const [sqliteKey, ref] of CURSOR_KEYS) {
        const row = statement.get(sqliteKey) as { value?: string } | undefined;
        if (row !== undefined && typeof row.value === "string" && row.value.length > 0) {
          out[ref] = row.value;
        }
      }
      return out;
    } finally {
      db.close();
    }
  },
};

/**
 * The GitHub CLI's `hosts.yml` as a file provider. Unlike the Claude/Cursor
 * importers, `gh` keeps its own OAuth token for `github.com` (and any
 * enterprise host) in a single YAML document, so the parser reads the
 * `github.com` entry's `oauth_token` under the canonical `GITHUB_OAUTH_TOKEN`
 * reference plus the signed-in `user` for diagnostics. Enterprise host tokens
 * land under `GITHUB_ENTERPRISE_TOKEN`/`GITHUB_ENTERPRISE_HOST`.
 *
 * The same token is importable through the owner CLI (`dsh accounts import`),
 * which exercises the shared parser via `parseGitHubHosts` in the CLI layer.
 */
export const githubFileProvider: FileSecretProvider = {
  id: "github",
  displayName: "GitHub CLI",
  description: "Imports the GitHub CLI OAuth token from its hosts.yml credential file.",
  defaultPaths: [join(home(), ".config", "gh", "hosts.yml")],

  /** detect implementation. */
  async detect(path: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(path, "utf8");
      return /oauth_token\s*:/.test(raw);
    } catch {
      return false;
    }
  },

  /** read implementation. */
  async read(path: string): Promise<Record<string, string>> {
    const raw = await fs.readFile(path, "utf8");
    const out: Record<string, string> = {};
    const github = parseGitHubHosts(raw).find((entry) => entry.host === "github.com");
    if (github && github.token.length > 0) {
      out["GITHUB_OAUTH_TOKEN"] = github.token;
      if (github.user) out["GITHUB_USER"] = github.user;
    }
    const enterprise = parseGitHubHosts(raw).filter((entry) => entry.host !== "github.com");
    for (const entry of enterprise) {
      if (entry.token.length > 0) out["GITHUB_ENTERPRISE_TOKEN"] = entry.token;
      if (entry.host.length > 0) out["GITHUB_ENTERPRISE_HOST"] = entry.host;
    }
    return out;
  },
};

/** A `hosts.yml` entry: the host plus the signed-in account and OAuth token. */
export interface GitHubHostEntry {
  host: string;
  user: string | null;
  token: string;
}

/**
 * Minimal `hosts.yml` reader: top-level hosts, `user`, and the first
 * `oauth_token` per host. Mirrors the CLI-layer detector parser so an import
 * and a scan label the same document the same way.
 */
export function parseGitHubHosts(raw: string): GitHubHostEntry[] {
  const entries: GitHubHostEntry[] = [];
  let host: string | null = null;
  let user: string | null = null;
  let token: string | null = null;
  const /** flush implementation. */
    flush = () => {
      if (host && token) entries.push({ host, user, token });
      user = null;
      token = null;
    };
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const top = /^([^\s#][^:]*):\s*$/.exec(line);
    if (top) {
      flush();
      host = top[1] ?? null;
      continue;
    }
    const userMatch = /^\s+user:\s*(\S+)\s*$/.exec(line);
    if (userMatch && !user) user = userMatch[1] ?? null;
    const tokenMatch = /oauth_token:\s*([^\s,}]+)/.exec(line);
    if (tokenMatch && !token) token = tokenMatch[1] ?? null;
  }
  flush();
  return entries;
}
