/**
 * Reads every issue's hygiene-relevant state in one pass.
 *
 * `blocked` is deliberately sourced from two durable signals — an open
 * `blocked_by` dependency, or an explicit `blocked` label — so that a blocked
 * item stays blocked through a reconciliation that rederives Status from
 * scratch. A block recorded only as a board Status cannot survive, and is not
 * treated as one here. `idea` works the same way, through `type:idea`.
 *
 * @module @dsh-stack/scripts/collect-issue-states
 */
import { runGh } from "./run-gh.mjs";

const BLOCKED_LABEL = "blocked";
const IDEA_LABEL = "type:idea";

/**
 * Collects issue states, including whether each is blocked and fully triaged.
 *
 * @param {object} source - Where to read from.
 * @param {string} source.owner - Repository owner.
 * @param {string} source.repo - Repository name.
 * @param {string} [source.token] - Token for repository reads.
 * @returns {Map<number, {number: number, state: string, assigned: boolean, labels: string[], blocked: boolean, idea: boolean, triaged: boolean, title: string}>}
 */
export function collectIssueStates({ owner, repo, token }) {
  const issues = JSON.parse(
    runGh(
      [
        "issue",
        "list",
        "--repo",
        `${owner}/${repo}`,
        "--state",
        "all",
        "--limit",
        "1000",
        "--json",
        "number,state,assignees,labels,title",
      ],
      token,
    ),
  );

  const blockedByDependency = collectBlockedByCounts({ owner, repo, token });

  const byNumber = new Map();
  for (const issue of issues) {
    const labels = issue.labels.map((label) => label.name);
    byNumber.set(issue.number, {
      number: issue.number,
      state: issue.state.toLowerCase(),
      assigned: issue.assignees.length > 0,
      labels,
      blocked: labels.includes(BLOCKED_LABEL) || (blockedByDependency.get(issue.number) ?? 0) > 0,
      idea: labels.includes(IDEA_LABEL),
      triaged:
        labels.some((name) => name.startsWith("area:")) &&
        labels.some((name) => name.startsWith("severity:")),
      title: issue.title,
    });
  }
  return byNumber;
}

/**
 * Counts open `blocked_by` dependencies per open issue.
 *
 * Dependencies are a newer GitHub capability; if the field is unavailable the
 * sweep still runs, falling back to the `blocked` label alone rather than
 * failing the whole reconciliation.
 *
 * @param {{owner: string, repo: string, token?: string}} source - Repository to query.
 * @returns {Map<number, number>} Open blocker count by issue number.
 */
function collectBlockedByCounts({ owner, repo, token }) {
  const counts = new Map();
  let cursor = null;
  try {
    for (;;) {
      const query = `query($owner:String!,$repo:String!,$cursor:String){
        repository(owner:$owner,name:$repo){
          issues(states:OPEN,first:100,after:$cursor){
            pageInfo{ hasNextPage endCursor }
            nodes{ number blockedBy(first:1){ totalCount } }
          }
        }
      }`;
      const args = ["api", "graphql", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `repo=${repo}`];
      if (cursor) args.push("-F", `cursor=${cursor}`);
      const page = JSON.parse(runGh(args, token)).data.repository.issues;
      for (const node of page.nodes) counts.set(node.number, node.blockedBy.totalCount);
      if (!page.pageInfo.hasNextPage) break;
      cursor = page.pageInfo.endCursor;
    }
  } catch (error) {
    process.stderr.write(
      `hygiene: blocked_by dependencies unavailable, using the '${BLOCKED_LABEL}' label only (${error.message.split("\n")[0]})\n`,
    );
  }
  return counts;
}
