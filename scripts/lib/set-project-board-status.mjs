/**
 * Writes one item's Status on a project board, adding the item first if the
 * board does not carry it yet.
 *
 * Adding on demand is what lets the sweep enforce "every open issue and pull
 * request is on the board" without a separate reconciliation pass: an item that
 * should have a Status but is missing entirely gets both in one step.
 *
 * @module @dsh-stack/scripts/set-project-board-status
 */
import { runGh } from "./run-gh.mjs";

/**
 * Sets an item's Status, adding it to the board when absent.
 *
 * @param {object} write - The write to perform.
 * @param {string} write.owner - Project owner login.
 * @param {number|string} write.number - Project number.
 * @param {string} write.projectId - Project node id.
 * @param {string} write.statusFieldId - Status field node id.
 * @param {string} write.optionId - Status option node id to set.
 * @param {string} write.url - Issue or pull request URL.
 * @param {string} [write.itemId] - Board item id, when already known.
 * @param {string} [write.token] - Token with Projects access.
 * @returns {string} The board item id that was written.
 */
export function setProjectBoardStatus(write) {
  const { owner, number, projectId, statusFieldId, optionId, url, token } = write;

  let itemId = write.itemId;
  if (!itemId) {
    itemId = JSON.parse(
      runGh(
        [
          "project",
          "item-add",
          String(number),
          "--owner",
          owner,
          "--url",
          url,
          "--format",
          "json",
        ],
        token,
      ),
    ).id;
  }

  runGh(
    [
      "project",
      "item-edit",
      "--project-id",
      projectId,
      "--id",
      itemId,
      "--field-id",
      statusFieldId,
      "--single-select-option-id",
      optionId,
    ],
    token,
  );
  return itemId;
}
