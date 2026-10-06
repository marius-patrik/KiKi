/**
 * Probes the local machine for a fixed set of developer binaries (tmux,
 * docker, gh, claude, cursor, ollama, git, node, python3, dsh), plus a bit
 * of per-binary detail (tmux session count, docker daemon reachability,
 * gh auth account), and folds in the on-disk usage-stats readers to build
 * the payload served from `GET /quotas/api/integrations`.
 * @module providers/quotas/web/binary-probe
 */

import { execSync } from "node:child_process";
import * as os from "node:os";
import {
  readAntigravityStats,
  readClaudeStats,
  readOllamaStats,
  type AntigravityStats,
  type ClaudeStats,
  type OllamaStats,
} from "./usage-stats.js";

export interface BinaryInfo {
  installed: boolean;
  path: string | null;
  version: string | null;
  detail?: string;
}

const TARGET_BINARIES = [
  "tmux",
  "docker",
  "gh",
  "claude",
  "cursor",
  "ollama",
  "git",
  "node",
  "python3",
  "dsh",
] as const;

/** Locate one binary on PATH and, best-effort, its reported version. */
function probeBinary(name: string): BinaryInfo {
  try {
    const binPath = execSync(`which ${name}`, { encoding: "utf-8", timeout: 1200 }).trim();
    let version = "installed";
    try {
      const raw = execSync(`${binPath} --version`, { encoding: "utf-8", timeout: 1500 }).trim();
      version = raw.split("\n")[0] ?? "installed";
    } catch {
      if (name === "tmux") {
        try {
          version = execSync(`${binPath} -V`, { encoding: "utf-8", timeout: 1500 }).trim();
        } catch {}
      }
    }
    return { installed: true, path: binPath, version };
  } catch {
    return { installed: false, path: null, version: null };
  }
}

/** Count active tmux sessions, if tmux is installed. */
function tmuxSessionDetail(): string {
  let sessions = 0;
  try {
    const list = execSync("tmux list-sessions 2>/dev/null || true", {
      encoding: "utf-8",
      timeout: 1200,
    }).trim();
    sessions = list ? list.split("\n").length : 0;
  } catch {}
  return `${sessions} active session${sessions === 1 ? "" : "s"}`;
}

/** Check whether the docker daemon is reachable, if the docker CLI is installed. */
function dockerDaemonDetail(): string {
  try {
    execSync("docker info 2>/dev/null", { encoding: "utf-8", timeout: 1500 });
    return "Daemon active & responsive";
  } catch {
    return "CLI ready (Daemon standby)";
  }
}

/** Read the logged-in GitHub account from `gh auth status`, if authenticated. */
function ghAccountDetail(): { account: string | null; detail: string } {
  try {
    const auth = execSync("gh auth status 2>&1 || true", { encoding: "utf-8", timeout: 2000 });
    const match = auth.match(/account\s+([^\s]+)/);
    const account = match ? (match[1] ?? null) : null;
    return { account, detail: account ? `Logged in as ${account}` : "Not logged in" };
  } catch {
    return { account: null, detail: "Not logged in" };
  }
}

export interface IntegrationsSnapshot {
  binaries: Record<string, BinaryInfo>;
  tmux: BinaryInfo | undefined;
  docker: BinaryInfo | undefined;
  github: { installed: boolean; account: string };
  claudeStats: ClaudeStats | null;
  antigravity: AntigravityStats | null;
  ollama: OllamaStats;
}

/** Probe every target binary and aggregate real usage stats for the integrations panel. */
export function probeBinariesAndUsage(): IntegrationsSnapshot {
  const home = os.homedir();
  const binaries: Record<string, BinaryInfo> = {};

  for (const name of TARGET_BINARIES) {
    binaries[name] = probeBinary(name);
  }

  if (binaries["tmux"]?.installed) {
    binaries["tmux"].detail = tmuxSessionDetail();
  }
  if (binaries["docker"]?.installed) {
    binaries["docker"].detail = dockerDaemonDetail();
  }

  let ghAccount: string | null = null;
  if (binaries["gh"]?.installed) {
    const gh = ghAccountDetail();
    ghAccount = gh.account;
    binaries["gh"].detail = gh.detail;
  }

  return {
    binaries,
    tmux: binaries["tmux"],
    docker: binaries["docker"],
    github: {
      installed: binaries["gh"]?.installed || false,
      account: ghAccount || "marius-patrik",
    },
    claudeStats: readClaudeStats(home),
    antigravity: readAntigravityStats(home),
    ollama: readOllamaStats(),
  };
}
