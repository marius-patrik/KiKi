/**
 * Decides what a hygiene sweep may do with a remote branch that has no open
 * pull request.
 *
 * The tiers exist because "no pull request" covers two very different
 * situations. A branch whose commits are all already reachable from `main`
 * cannot lose anything when deleted — there is nothing in it to lose. A branch
 * that is ahead of `main` holds work nobody is reviewing, which is a problem to
 * surface, never one to solve by deleting it.
 *
 * Anything the sweep cannot confidently place lands in `report`, so an
 * unfamiliar branch shape produces a line in a report rather than an action.
 *
 * @module @dsh-stack/scripts/classify-branch-disposition
 */

/** Branch namespaces owned by other automation, which this sweep never touches. */
const RESERVED_BRANCH_PREFIXES = Object.freeze([
  "dependabot/",
  "gh-readonly-queue/",
  "renovate/",
  "revert-",
]);

/**
 * Classifies one branch into the action the sweep is permitted to take.
 *
 * @param {object} branch - The branch's observed state.
 * @param {string} branch.name - Branch name, without the remote prefix.
 * @param {boolean} branch.hasOpenPull - Whether an open pull request already
 *   targets `main` from this branch.
 * @param {number} branch.commitsAhead - Commits reachable from the branch but
 *   not from `main`.
 * @param {number} branch.ageHours - Hours since the branch's last commit.
 * @param {number} graceHours - How long a branch may exist with no pull request
 *   before the sweep acts on it.
 * @returns {{action: "skip"|"delete"|"open-draft-pull"|"report", reason: string}}
 *   The permitted action and the sentence explaining it.
 */
export function classifyBranchDisposition(branch, graceHours) {
  const { name, hasOpenPull, commitsAhead, ageHours } = branch;

  if (name === "main") return { action: "skip", reason: "the release branch" };
  if (hasOpenPull) return { action: "skip", reason: "already has an open pull request" };

  const reserved = RESERVED_BRANCH_PREFIXES.find((prefix) => name.startsWith(prefix));
  if (reserved) return { action: "skip", reason: `owned by other automation (${reserved}*)` };

  if (ageHours < graceHours) {
    return {
      action: "skip",
      reason: `within the ${graceHours}h grace period (last commit ${Math.floor(ageHours)}h ago)`,
    };
  }

  if (!Number.isInteger(commitsAhead) || commitsAhead < 0) {
    return { action: "report", reason: "could not determine how far it is ahead of main" };
  }

  if (commitsAhead === 0) {
    return { action: "delete", reason: "every commit is already reachable from main" };
  }

  return {
    action: "open-draft-pull",
    reason: `${commitsAhead} commit(s) ahead of main with no pull request`,
  };
}
