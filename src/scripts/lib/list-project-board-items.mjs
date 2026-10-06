/**
 * Reads every item on a project board, keyed by the issue or pull request it
 * tracks.
 *
 * The sweep compares the whole board against the whole repository in one pass,
 * so it reads the board once rather than querying per item.
 *
 * @module @dsh-stack/scripts/list-project-board-items
 */
import { runGh } from "./run-gh.mjs";

/**
 * Lists a board's items indexed by content number.
 *
 * @param {object} board - Which board to read.
 * @param {string} board.owner - Project owner login.
 * @param {number|string} board.number - Project number.
 * @param {string} [board.token] - Token with Projects access.
 * @param {number} [board.limit] - Maximum items to read.
 * @returns {Map<number, {id: string, status: string|null, url: string, type: string}>}
 *   Board items by issue or pull request number. Items tracking no repository
 *   content (draft notes) are omitted, because nothing in the repository can
 *   derive a Status for them.
 */
export function listProjectBoardItems({ owner, number, token, limit = 500 }) {
  let items;
  try {
    ({ items } = JSON.parse(
      runGh(
        [
          "project",
          "item-list",
          String(number),
          "--owner",
          owner,
          "--limit",
          String(limit),
          "--format",
          "json",
        ],
        token,
      ),
    ));
  } catch (error) {
    // `gh project` resolves the owner type through the API before it does anything
    // else, and an unusable token makes that lookup fail, so it reports
    // "unknown owner type" -- which reads like a project-ownership problem and is
    // not one. Reproduced byte-for-byte with a deliberately invalid token. Naming
    // the credential here is the difference between a fixable report and a hunt.
    throw new Error(
      `cannot read project ${number} owned by ${owner}: ${error instanceof Error ? error.message : String(error)}. ` +
        'If that says "unknown owner type", the token cannot authenticate at all -- check PROJECTS_TOKEN ' +
        "(it is a classic PAT holding the `project` scope; an expired or revoked one fails this way). " +
        "Rotate it, then confirm with: gh project item-list " +
        `${number} --owner ${owner} --limit 1`,
      { cause: error },
    );
  }

  const byNumber = new Map();
  for (const item of items) {
    const content = item.content ?? {};
    if (typeof content.number !== "number") continue;
    byNumber.set(content.number, {
      id: item.id,
      status: item.status ?? null,
      url: content.url,
      type: content.type,
    });
  }
  return byNumber;
}
