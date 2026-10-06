/**
 * Reads every pull request's hygiene-relevant state, including the issues each
 * one claims to act on.
 *
 * @module @dsh-stack/scripts/collect-pull-request-states
 */
import { parseLinkedIssueNumbers } from "./parse-linked-issue-numbers.mjs";
import { runGh } from "./run-gh.mjs";

/**
 * Collects pull request states and their linked issue numbers.
 *
 * @param {object} source - Where to read from.
 * @param {string} source.owner - Repository owner.
 * @param {string} source.repo - Repository name.
 * @param {string} [source.token] - Token for repository reads.
 * @returns {Map<number, {number: number, state: string, draft: boolean, headRefName: string, linkedIssues: number[], title: string}>}
 */
export function collectPullRequestStates({ owner, repo, token }) {
  const pulls = JSON.parse(
    runGh(
      [
        "pr",
        "list",
        "--repo",
        `${owner}/${repo}`,
        "--state",
        "all",
        "--limit",
        "1000",
        "--json",
        "number,state,isDraft,headRefName,title,body",
      ],
      token,
    ),
  );

  const byNumber = new Map();
  for (const pull of pulls) {
    byNumber.set(pull.number, {
      number: pull.number,
      state: pull.state.toLowerCase(),
      draft: pull.isDraft,
      headRefName: pull.headRefName,
      linkedIssues: parseLinkedIssueNumbers(pull.title, pull.body),
      title: pull.title,
    });
  }
  return byNumber;
}
