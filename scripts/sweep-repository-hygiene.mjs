/**
 * Reconciles repository state against the hygiene rule, in one pass, from
 * current truth.
 *
 * Event-driven hooks alone cannot keep this repository consistent, and the
 * failure is structural rather than a bug to fix: GitHub runs `pull_request`
 * workflows against `refs/pull/N/merge`, so a conflicting pull request emits no
 * events at all; a workflow added today never sees the backlog that predates
 * it; and a failed run drops its events silently. Anything that must be true of
 * every item therefore needs a sweep that can rederive the answer from scratch,
 * independent of which events did or did not fire.
 *
 * What it enforces:
 *
 * - Board Status is a projection of repository state, reconciled in both
 *   directions, including terminal states — merged or closed means Done.
 * - Every open issue and pull request is on the board.
 * - A non-`main` branch is either backed by an open pull request, provably
 *   contained in `main` and deleted, or surfaced as a draft pull request.
 * - Issues missing a required `area:*` or `severity:*` label are reported.
 *
 * Usage:
 *   node src/scripts/sweep-repository-hygiene.mjs [--dry-run]
 *
 * @module @dsh-stack/scripts/sweep-repository-hygiene
 */
import { appendFileSync } from "node:fs";
import { classifyBranchDisposition } from "./lib/classify-branch-disposition.mjs";
import { collectBranchStates } from "./lib/collect-branch-states.mjs";
import { collectIssueStates } from "./lib/collect-issue-states.mjs";
import { collectPullRequestStates } from "./lib/collect-pull-request-states.mjs";
import { deriveBoardStatus } from "./lib/derive-board-status.mjs";
import { listProjectBoardItems } from "./lib/list-project-board-items.mjs";
import { resolveProjectBoardFields } from "./lib/resolve-project-board-fields.mjs";
import { runGh } from "./lib/run-gh.mjs";
import { setProjectBoardStatus } from "./lib/set-project-board-status.mjs";

const dryRun = process.argv.includes("--dry-run");
const owner = process.env.HYGIENE_REPO_OWNER ?? "marius-patrik";
const repo = process.env.HYGIENE_REPO_NAME ?? "dsh-stack";
const boardOwner = process.env.PROJECT_OWNER ?? owner;
const boardNumber = process.env.PROJECT_NUMBER ?? "13";
const projectsToken = process.env.PROJECTS_TOKEN;
const graceHours = Number(process.env.HYGIENE_BRANCH_GRACE_HOURS ?? "24");
const repoUrl = `https://github.com/${owner}/${repo}`;

const actions = [];
/**
 * Records one action for the run summary and streams it to stdout.
 *
 * Every line is both kept for the summary and flushed immediately, so a run
 * that fails partway still leaves an audit trail of what it had already done.
 *
 * @param {string} line - The action, already formatted for a reader.
 */
const record = (line) => {
  actions.push(line);
  process.stdout.write(`${line}\n`);
};

const issues = collectIssueStates({ owner, repo });
const pulls = collectPullRequestStates({ owner, repo });
const branches = collectBranchStates({ owner, repo, pulls });
const board = listProjectBoardItems({
  owner: boardOwner,
  number: boardNumber,
  token: projectsToken,
});
const { projectId, statusFieldId, optionIds } = resolveProjectBoardFields({
  owner: boardOwner,
  number: boardNumber,
  token: projectsToken,
});

// An issue follows the open pull request that claims it, so resolve that link
// before deriving any Status.
const linkedPullState = new Map();
for (const pull of pulls.values()) {
  if (pull.state !== "open") continue;
  for (const issueNumber of pull.linkedIssues) {
    if (pull.draft && linkedPullState.get(issueNumber) === "ready") continue;
    linkedPullState.set(issueNumber, pull.draft ? "draft" : "ready");
  }
}

/**
 * Applies one item's derived Status to the board when it disagrees.
 *
 * @param {{kind: string, number: number, url: string, desired: string}} item -
 *   The item and the Status its repository state implies.
 */
function reconcileStatus(item) {
  const existing = board.get(item.number);
  if (existing?.status === item.desired) return;

  const optionId = optionIds[item.desired];
  if (!optionId) {
    record(`board: SKIP #${item.number} — no '${item.desired}' option on the board`);
    return;
  }

  const from = existing ? (existing.status ?? "(no status)") : "(not on board)";
  record(`board: #${item.number} ${from} -> ${item.desired}`);
  if (dryRun) return;

  setProjectBoardStatus({
    owner: boardOwner,
    number: boardNumber,
    projectId,
    statusFieldId,
    optionId,
    url: item.url,
    itemId: existing?.id,
    token: projectsToken,
  });
}

for (const issue of issues.values()) {
  // A closed issue that never reached the board is history, not a gap to fill.
  if (issue.state !== "open" && !board.has(issue.number)) continue;
  reconcileStatus({
    kind: "issue",
    number: issue.number,
    url: `${repoUrl}/issues/${issue.number}`,
    desired: deriveBoardStatus({
      kind: "issue",
      state: issue.state,
      blocked: issue.blocked,
      assigned: issue.assigned,
      triaged: issue.triaged,
      idea: issue.idea,
      linkedPullState: linkedPullState.get(issue.number) ?? null,
    }),
  });
}

for (const pull of pulls.values()) {
  if (pull.state !== "open" && !board.has(pull.number)) continue;
  reconcileStatus({
    kind: "pull",
    number: pull.number,
    url: `${repoUrl}/pull/${pull.number}`,
    desired: deriveBoardStatus({ kind: "pull", state: pull.state, draft: pull.draft }),
  });
}

const branchReports = [];
for (const branch of branches) {
  const { action, reason } = classifyBranchDisposition(branch, graceHours);
  if (action === "skip") continue;

  if (action === "report") {
    branchReports.push(`\`${branch.name}\` — ${reason}`);
    record(`branch: REPORT ${branch.name} — ${reason}`);
    continue;
  }

  if (action === "delete") {
    record(`branch: DELETE ${branch.name} — ${reason}`);
    if (dryRun) continue;
    runGitHubDelete(branch.name);
    continue;
  }

  record(`branch: DRAFT PR ${branch.name} — ${reason}`);
  if (dryRun) continue;
  openDraftPull(branch.name, reason);
}

/**
 * Deletes one remote branch, logging the target as a destructive action.
 *
 * @param {string} name - Branch to delete.
 */
function runGitHubDelete(name) {
  try {
    runGh(["api", "-X", "DELETE", `repos/${owner}/${repo}/git/refs/heads/${name}`]);
  } catch (error) {
    record(`branch: DELETE FAILED ${name} — ${error.message.split("\n")[0]}`);
  }
}

/**
 * Opens a draft pull request for a branch that is ahead of `main` with none.
 *
 * @param {string} name - Branch to propose.
 * @param {string} reason - Why the sweep is proposing it.
 */
function openDraftPull(name, reason) {
  const body = [
    `Opened automatically by the repository hygiene sweep.`,
    ``,
    `\`${name}\` is ${reason}, so its work was not visible to review. This draft`,
    `exists so the branch has an owner and a decision, per the repository hygiene`,
    `rule. Take it over, or close it and delete the branch.`,
    ``,
    `Refs #282.`,
  ].join("\n");
  try {
    runGh([
      "pr",
      "create",
      "--repo",
      `${owner}/${repo}`,
      "--base",
      "main",
      "--head",
      name,
      "--draft",
      "--title",
      `chore: unreviewed branch \`${name}\` needs a decision`,
      "--body",
      body,
    ]);
  } catch (error) {
    record(`branch: DRAFT PR FAILED ${name} — ${error.message.split("\n")[0]}`);
  }
}

const missingLabels = [...issues.values()]
  // A parked idea is untriaged by definition; reporting it every run would be
  // noise that never clears, so `type:idea` is what marks the gap as intended.
  .filter((issue) => issue.state === "open" && !issue.triaged && !issue.idea)
  .map((issue) => {
    const missing = [];
    if (!issue.labels.some((name) => name.startsWith("area:"))) missing.push("area");
    if (!issue.labels.some((name) => name.startsWith("severity:"))) missing.push("severity");
    return `#${issue.number} — missing ${missing.join(" + ")} — ${issue.title}`;
  });

for (const line of missingLabels) record(`label: ${line}`);

const summary = [
  `# Repository hygiene sweep`,
  ``,
  `- board writes: ${actions.filter((line) => line.startsWith("board:")).length}`,
  `- branch actions: ${actions.filter((line) => line.startsWith("branch:")).length}`,
  `- issues missing required labels: ${missingLabels.length}`,
  ...(branchReports.length
    ? [``, `## Branches needing a human decision`, ...branchReports.map((line) => `- ${line}`)]
    : []),
  ...(missingLabels.length
    ? [``, `## Issues missing required labels`, ...missingLabels.map((line) => `- ${line}`)]
    : []),
  ``,
  dryRun ? `_Dry run: nothing was written._` : `_Applied._`,
].join("\n");

process.stdout.write(`\n${summary}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
