/**
 * Prune worktrees whose PRs have merged (#269): for every registered worktree
 * of the Stack checkout, verify the safety conditions (clean tree, no unpushed
 * commits, a merged PR for its branch confirmed via gh) and remove the
 * worktree, its local branch, and stale remote-tracking refs. Anything that
 * fails a safety check is kept and reported, never silently removed.
 */

import { spawnSync } from "node:child_process";
import { decidePrune, parseWorktreeList, type WorktreeEntry } from "./worktree-prune.js";

/** Options for {@link pruneMergedWorktrees}. */
export interface PruneWorktreesOptions {
  /** Stack checkout to operate on (any worktree of the repo works). */
  repoDir: string;
  /** Directory containing the running dsh — its worktree is never pruned. */
  pkgDir: string;
  /** Progress reporter; each kept or pruned worktree produces one line. */
  log: (msg: string) => void;
}

/** Run a command synchronously, returning stdout on success or null on failure. */
function run(cmd: string, args: string[], cwd: string): string | null {
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (res.error !== undefined || res.status !== 0 || res.stdout === undefined) return null;
  return res.stdout;
}

/** Resolve `owner/repo` from the checkout's origin URL, or null when unparsable. */
export function originRepo(repoDir: string): string | null {
  const url = run("git", ["remote", "get-url", "origin"], repoDir)?.trim();
  if (url === undefined || url === null || url === "") return null;
  const match = /(?:github\.com[:/])([^/]+\/[^/.]+)(?:\.git)?$/.exec(url);
  return match?.[1] ?? null;
}

/** True when gh confirms a merged PR exists for `branch`. False when gh is unavailable. */
function hasMergedPr(repoDir: string, repo: string, branch: string): boolean {
  const out = run(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "merged",
      "--head",
      branch,
      "--json",
      "number",
      "--limit",
      "1",
    ],
    repoDir,
  );
  if (out === null) return false;
  try {
    return (JSON.parse(out) as unknown[]).length > 0;
  } catch {
    return false;
  }
}

/** Commits ahead of upstream, or null when the branch has no upstream. */
function unpushedCount(worktreePath: string): number | null {
  const out = run("git", ["rev-list", "--count", "@{u}..HEAD"], worktreePath);
  if (out === null) return null;
  const count = Number(out.trim());
  return Number.isInteger(count) && count >= 0 ? count : null;
}

/**
 * Remove one verified worktree: plain `git worktree remove` first; when the
 * worktree contains an initialized submodule (which git refuses to remove),
 * deinit the submodule and retry with --force. Both paths are safe here —
 * the caller has already verified the tree is clean and fully pushed.
 */
function removeWorktree(repoDir: string, entry: WorktreeEntry): boolean {
  if (run("git", ["worktree", "remove", entry.path], repoDir) !== null) return true;
  run("git", ["submodule", "deinit", "-f", "--all"], entry.path);
  return run("git", ["worktree", "remove", "--force", entry.path], repoDir) !== null;
}

/**
 * Prune every worktree whose branch has a merged PR. Never prunes the primary
 * checkout, the worktree hosting the running dsh, or anything failing a safety
 * check. Best-effort: individual failures are logged, never thrown.
 */
export async function pruneMergedWorktrees(opts: PruneWorktreesOptions): Promise<void> {
  const { repoDir, pkgDir, log } = opts;
  const porcelain = run("git", ["worktree", "list", "--porcelain"], repoDir);
  if (porcelain === null) {
    log("dsh: worktree prune skipped (git worktree list failed)");
    return;
  }
  const entries = parseWorktreeList(porcelain).filter((entry) => !entry.isMain);
  if (entries.length === 0) return;
  const repo = originRepo(repoDir);
  if (repo === null) {
    log("dsh: worktree prune skipped (could not resolve origin remote)");
    return;
  }
  let prunedAny = false;
  for (const entry of entries) {
    if (pkgDir.startsWith(`${entry.path}/`) || pkgDir === entry.path) {
      log(`dsh: keeping ${entry.path} (running dsh lives here)`);
      continue;
    }
    const branch = entry.branch;
    if (branch === null) {
      log(`dsh: keeping ${entry.path} (detached HEAD)`);
      continue;
    }
    const decision = decidePrune({
      branch,
      clean: run("git", ["status", "--porcelain"], entry.path)?.trim() === "",
      unpushed: unpushedCount(entry.path),
      hasMergedPr: hasMergedPr(repoDir, repo, branch),
    });
    if (decision.action === "keep") {
      log(`dsh: keeping ${entry.path} (${decision.reason})`);
      continue;
    }
    if (!removeWorktree(repoDir, entry)) {
      log(`dsh: keeping ${entry.path} (git worktree remove failed)`);
      continue;
    }
    // -D is safe here: the branch tip is fully pushed (unpushed === 0) and the
    // PR that carried it is merged; squash merges defeat `branch -d`.
    run("git", ["branch", "-D", branch], repoDir);
    prunedAny = true;
    log(`dsh: pruned ${entry.path} (${branch})`);
  }
  if (prunedAny) run("git", ["fetch", "--prune", "origin"], repoDir);
}
