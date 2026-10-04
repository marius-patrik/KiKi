/**
 * Resolves the project id and Status field/option ids the board writes need.
 *
 * `gh project item-edit` addresses everything by node id, so a single lookup up
 * front turns the human-facing project number and Status names into the ids the
 * rest of a run uses.
 *
 * @module @dsh-stack/scripts/resolve-project-board-fields
 */
import { runGh } from "./run-gh.mjs";

/**
 * Looks up one project's id and the id of every option on its Status field.
 *
 * @param {object} board - Which board to resolve.
 * @param {string} board.owner - Project owner login.
 * @param {number|string} board.number - Project number.
 * @param {string} [board.token] - Token with Projects access, if it differs
 *   from the ambient one.
 * @returns {{projectId: string, statusFieldId: string, optionIds: Record<string, string>}}
 * @throws When the project or its Status field cannot be found.
 */
export function resolveProjectBoardFields({ owner, number, token }) {
  const projects = JSON.parse(
    runGh(["project", "list", "--owner", owner, "--format", "json", "--limit", "100"], token),
  ).projects;
  const project = projects.find((candidate) => String(candidate.number) === String(number));
  if (!project) throw new Error(`no project number ${number} owned by ${owner}`);

  const fields = JSON.parse(
    runGh(
      ["project", "field-list", String(number), "--owner", owner, "--format", "json"],
      token,
    ),
  ).fields;
  const status = fields.find((field) => field.name === "Status");
  if (!status) throw new Error(`project ${number} has no Status field`);

  const optionIds = Object.fromEntries(
    (status.options ?? []).map((option) => [option.name, option.id]),
  );
  return { projectId: project.id, statusFieldId: status.id, optionIds };
}
