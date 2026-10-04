import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinkedIssueNumbers } from "./parse-linked-issue-numbers.mjs";

test("reads closing keywords from the body", () => {
  assert.deepEqual(parseLinkedIssueNumbers("t", "Fixes #12 and closes #7"), [7, 12]);
});

test("reads a trailing parenthesised reference from the title", () => {
  assert.deepEqual(parseLinkedIssueNumbers("feat(settings): merge sections (#238)", ""), [238]);
});

test("a parenthesised mention in body prose is not a link", () => {
  const body = "It does not provision the CI node itself (#114) or make it an extension (#61).";
  assert.deepEqual(parseLinkedIssueNumbers("ci: autoscaling pool", body), []);
});

test("the title reference still wins when the body only mentions others", () => {
  const body = "Refs #114 for background; see also (#99).";
  assert.deepEqual(parseLinkedIssueNumbers("ci: pool (#61)", body), [61]);
});

test("deduplicates across conventions and fields", () => {
  assert.deepEqual(parseLinkedIssueNumbers("fix: thing (#5)", "Resolves #5"), [5]);
});

test("a bare '#123' with no keyword is not a link", () => {
  assert.deepEqual(parseLinkedIssueNumbers("t", "see #99 for background"), []);
});

test("tolerates an absent body", () => {
  assert.deepEqual(parseLinkedIssueNumbers("no references here", undefined), []);
});
