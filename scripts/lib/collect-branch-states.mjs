/**
 * Reads every remote branch's position relative to `main`, without needing a
 * checkout.
 *
 * The compare API reports how far a branch is ahead of `main` directly, which
 * is the one measurement the branch policy turns on: a branch zero commits
 * ahead holds nothing that deleting it could lose.
 *
 * @module @dsh-stack/scripts/collect-branch-states
 */
import { runGh } from "./run-gh.mjs";

/**
 * Collects branch names, their distance ahead of `main`, and their age.
 *
 * @param {object} source - Where to read from.
 * @param {string} source.owner - Repository owner.
 * @param {string} source.repo - Repository name.
 * @param {Map<number, {state: string, headRefName: string}>} source.pulls - Pull
 *   requests, used to mark which branches already have an open one.
 * @param {string} [source.token] - Token for repository reads.
 * @returns {Array<{name: string, hasOpenPull: boolean, commitsAhead: number, ageHours: number}>}
 */
export function collectBranchStates({ owner, repo, pulls, token }) {
  const branches = JSON.parse(
    runGh(["api", "--paginate", `repos/${owner}/${repo}/branches?per_page=100`], token),
  );

  const branchesWithOpenPull = new Set(
    [...pulls.values()].filter((pull) => pull.state === "open").map((pull) => pull.headRefName),
  );

  const now = Date.now();
  return branches.map((branch) => {
    let commitsAhead = Number.NaN;
    let ageHours = Number.POSITIVE_INFINITY;
    try {
      const comparison = JSON.parse(
        runGh(
          ["api", `repos/${owner}/${repo}/compare/main...${encodeURIComponent(branch.name)}`],
          token,
        ),
      );
      commitsAhead = comparison.ahead_by;
      const committedAt = comparison.commits.at(-1)?.commit?.committer?.date;
      if (committedAt) ageHours = (now - Date.parse(committedAt)) / 3_600_000;
    } catch {
      // Leave the branch unmeasurable; the classifier reports rather than acts.
    }
    return {
      name: branch.name,
      hasOpenPull: branchesWithOpenPull.has(branch.name),
      commitsAhead,
      ageHours,
    };
  });
}
