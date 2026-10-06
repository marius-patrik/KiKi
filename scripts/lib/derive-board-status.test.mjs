import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD_STATUSES, deriveBoardStatus } from "./derive-board-status.mjs";

test("a merged pull request is Done", () => {
  assert.equal(deriveBoardStatus({ kind: "pull", state: "merged" }), "Done");
});

test("a closed issue is Done regardless of its other signals", () => {
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "closed", assigned: true, blocked: true }),
    "Done",
  );
});

test("an open pull request is In Review, or In Progress while draft", () => {
  assert.equal(deriveBoardStatus({ kind: "pull", state: "open", draft: false }), "In Review");
  assert.equal(deriveBoardStatus({ kind: "pull", state: "open", draft: true }), "In Progress");
});

test("an explicit block outranks ownership and review signals", () => {
  assert.equal(
    deriveBoardStatus({
      kind: "issue",
      state: "open",
      blocked: true,
      assigned: true,
      linkedPullState: "ready",
    }),
    "Blocked",
  );
});

test("an issue follows the pull request that references it", () => {
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "open", linkedPullState: "ready" }),
    "In Review",
  );
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "open", linkedPullState: "draft" }),
    "In Progress",
  );
});

test("an assigned issue with no pull request is In Progress", () => {
  assert.equal(deriveBoardStatus({ kind: "issue", state: "open", assigned: true }), "In Progress");
});

test("a parked idea is set aside before the triage split", () => {
  assert.equal(deriveBoardStatus({ kind: "issue", state: "open", idea: true }), "Ideas");
  // Labelling an idea does not promote it out of Ideas; only real work does.
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "open", idea: true, triaged: true }),
    "Ideas",
  );
});

test("real work on an idea outranks the parked marker", () => {
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "open", idea: true, assigned: true }),
    "In Progress",
  );
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "open", idea: true, linkedPullState: "ready" }),
    "In Review",
  );
  assert.equal(
    deriveBoardStatus({ kind: "issue", state: "open", idea: true, blocked: true }),
    "Blocked",
  );
  assert.equal(deriveBoardStatus({ kind: "issue", state: "closed", idea: true }), "Done");
});

test("triage completeness separates Ready from Backlog", () => {
  assert.equal(deriveBoardStatus({ kind: "issue", state: "open", triaged: true }), "Ready");
  assert.equal(deriveBoardStatus({ kind: "issue", state: "open", triaged: false }), "Backlog");
});

test("every derived value is a real board Status", () => {
  const cases = [
    { kind: "pull", state: "merged" },
    { kind: "pull", state: "open", draft: true },
    { kind: "pull", state: "open", draft: false },
    { kind: "issue", state: "closed" },
    { kind: "issue", state: "open", blocked: true },
    { kind: "issue", state: "open", linkedPullState: "ready" },
    { kind: "issue", state: "open", linkedPullState: "draft" },
    { kind: "issue", state: "open", assigned: true },
    { kind: "issue", state: "open", idea: true },
    { kind: "issue", state: "open", triaged: true },
    { kind: "issue", state: "open" },
  ];
  for (const item of cases) assert.ok(BOARD_STATUSES.includes(deriveBoardStatus(item)));
});
