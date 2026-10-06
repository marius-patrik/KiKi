import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyBranchDisposition } from "./classify-branch-disposition.mjs";

const GRACE = 24;
const branch = (over) => ({
  name: "feat/thing",
  hasOpenPull: false,
  commitsAhead: 3,
  ageHours: 100,
  ...over,
});

test("main is never acted on", () => {
  assert.equal(classifyBranchDisposition(branch({ name: "main" }), GRACE).action, "skip");
});

test("a branch with an open pull request is left alone", () => {
  assert.equal(classifyBranchDisposition(branch({ hasOpenPull: true }), GRACE).action, "skip");
});

test("branches owned by other automation are left alone", () => {
  for (const name of ["dependabot/npm/x", "gh-readonly-queue/main/y", "renovate/z", "revert-1-a"]) {
    assert.equal(classifyBranchDisposition(branch({ name }), GRACE).action, "skip", name);
  }
});

test("a branch still inside the grace period is left alone", () => {
  const result = classifyBranchDisposition(branch({ ageHours: 2 }), GRACE);
  assert.equal(result.action, "skip");
  assert.match(result.reason, /grace period/);
});

test("a branch fully contained in main is deleted", () => {
  const result = classifyBranchDisposition(branch({ commitsAhead: 0 }), GRACE);
  assert.equal(result.action, "delete");
  assert.match(result.reason, /already reachable from main/);
});

test("a branch ahead of main gets a draft pull request, never a deletion", () => {
  const result = classifyBranchDisposition(branch({ commitsAhead: 18 }), GRACE);
  assert.equal(result.action, "open-draft-pull");
  assert.match(result.reason, /18 commit/);
});

test("an unmeasurable branch is reported rather than acted on", () => {
  for (const commitsAhead of [Number.NaN, -1, undefined, null]) {
    assert.equal(classifyBranchDisposition(branch({ commitsAhead }), GRACE).action, "report");
  }
});
