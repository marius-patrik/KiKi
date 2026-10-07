/**
 * Pure logic for merged-PR worktree pruning (#269): parse `git worktree list
 * --porcelain` output and decide whether a worktree is safe to remove.
 * No side effects here; the orchestration lives in prune-worktrees.ts.
 */

/** One entry of `git worktree list --porcelain`. */
export interface WorktreeEntry {
  /** Absolute path of the worktree. */
  path: string;
  /** Short branch name, or null when detached. */
  branch: string | null;
  /** True for the primary checkout (always the first porcelain record). */
  isMain: boolean;
}

/**
 * Parse `git worktree list --porcelain` into entries. The primary checkout is
 * always the first record. Bare/detached records yield `branch: null`.
 */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: { path?: string; branch?: string | null } | null = null;
  /** Close the in-progress record: append it as an entry and reset. */
  const flush = () => {
    if (current?.path !== undefined) {
      entries.push({
        path: current.path,
        branch: current.branch ?? null,
        isMain: entries.length === 0,
      });
    }
    current = null;
  };
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length), branch: null };
    } else if (line.startsWith("branch ") && current !== null) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  flush();
  return entries;
}

/** Inputs deciding whether one worktree may be pruned. */
export interface PruneDecisionInput {
  /** The worktree's own branch name, or null when detached. */
  branch: string | null;
  /** True when `git status --porcelain` is empty. */
  clean: boolean;
  /** Commits ahead of the upstream, or null when the branch has no upstream. */
  unpushed: number | null;
  /** True when gh confirms a merged PR exists for this exact branch. */
  hasMergedPr: boolean;
}

/** Prune verdict: remove the worktree, or keep it with a reported reason. */
export type PruneDecision = { action: "prune" } | { action: "keep"; reason: string };

/**
 * Decide whether a worktree may be removed. Removal requires every safety
 * condition: a named branch, a clean tree, zero unpushed commits, and a
 * confirmed merged PR for the branch. Anything less is kept and reported —
 * never silently discarded (#269 acceptance).
 */
export function decidePrune(input: PruneDecisionInput): PruneDecision {
  if (input.branch === null) return { action: "keep", reason: "detached HEAD" };
  if (!input.clean) return { action: "keep", reason: "uncommitted changes" };
  if (input.unpushed === null) return { action: "keep", reason: "no upstream branch" };
  if (input.unpushed > 0) {
    return { action: "keep", reason: `${input.unpushed} unpushed commit(s)` };
  }
  if (!input.hasMergedPr) return { action: "keep", reason: "no merged PR for branch" };
  return { action: "prune" };
}
