/**
 * Derives a project-board Status from durable repository state.
 *
 * Board Status is a projection, never a source of truth. Every input this
 * reads — lifecycle state, assignees, labels, dependencies, the pull request
 * an issue is linked from — lives in the repository, so the same Status is
 * reproducible from scratch on any run without consulting the board's own
 * history. That is what makes reconciliation safe to run repeatedly: it can
 * only ever restate what the repository already says.
 *
 * The corollary is that Status set only on the board, with nothing in the
 * repository backing it, cannot survive a sweep. `Blocked` and `Ideas` are the
 * cases that matter in practice: `Blocked` means an open `blocked_by`
 * dependency or an explicit `blocked` label, and `Ideas` means a `type:idea`
 * label — neither is an unrecorded judgement.
 *
 * @module @dsh-stack/scripts/derive-board-status
 */

/** Board Status values, in lifecycle order. */
export const BOARD_STATUSES = Object.freeze([
  "Ideas",
  "Backlog",
  "Ready",
  "In Progress",
  "In Review",
  "Blocked",
  "Done",
]);

/**
 * Projects one item's repository state onto its board Status.
 *
 * Order matters: terminal state wins over everything, then an explicit block,
 * then whatever review or ownership signal exists. A parked idea is set aside
 * before the final split, so it is not mistaken for untriaged work; triage
 * completeness then separates a `Ready` item from a `Backlog` one.
 *
 * @param {object} item - The item's repository state.
 * @param {"issue"|"pull"} item.kind - Whether this is an issue or a pull request.
 * @param {"open"|"closed"|"merged"} item.state - Lifecycle state.
 * @param {boolean} [item.draft] - For a pull request, whether it is a draft.
 * @param {boolean} [item.blocked] - Whether an open `blocked_by` dependency or
 *   `blocked` label applies.
 * @param {boolean} [item.assigned] - Whether anyone is assigned.
 * @param {boolean} [item.triaged] - Whether both an `area:*` and a `severity:*`
 *   label are present.
 * @param {boolean} [item.idea] - Whether the `type:idea` label is present,
 *   marking the item as parked rather than scoped work.
 * @param {"draft"|"ready"|null} [item.linkedPullState] - For an issue, the state
 *   of the open pull request that references it, if any.
 * @returns {string} One of {@link BOARD_STATUSES}.
 */
export function deriveBoardStatus(item) {
  if (item.state === "merged" || item.state === "closed") return "Done";

  if (item.kind === "pull") return item.draft ? "In Progress" : "In Review";

  if (item.blocked) return "Blocked";
  if (item.linkedPullState === "ready") return "In Review";
  if (item.linkedPullState === "draft") return "In Progress";
  if (item.assigned) return "In Progress";
  // A parked idea is not untriaged work waiting to be picked up, so it does not
  // belong in the same column as an issue that simply lacks its labels.
  if (item.idea) return "Ideas";
  return item.triaged ? "Ready" : "Backlog";
}
