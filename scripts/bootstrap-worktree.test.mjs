import assert from "node:assert";
import { rewriteHomeRoot } from "./bootstrap-worktree.mjs";

console.log("Testing bootstrap-worktree helpers...");

// Test 1: rewrite homeRoot and preserve surrounding content.
{
  const input = `ui-theme:
  preference: dark
dsh-tweaks:
  homeRoot: /Users/user/Projects/dsh-stack/.data
providers:
  mode: all
`;
  const updated = rewriteHomeRoot(input, "/worktrees/issue-204/.data");
  assert.ok(
    updated.includes("homeRoot: /worktrees/issue-204/.data"),
    "homeRoot should be rewritten",
  );
  assert.ok(
    !updated.includes("homeRoot: /Users/user/Projects/dsh-stack/.data"),
    "old homeRoot should be gone",
  );
  assert.ok(updated.includes("preference: dark"), "other keys should be preserved");
  assert.ok(updated.includes("providers:"), "later blocks should be preserved");
}

// Test 2: no-op when homeRoot is already correct.
{
  const input = "dsh-tweaks:\n  homeRoot: /worktrees/issue-204/.data\n";
  const updated = rewriteHomeRoot(input, "/worktrees/issue-204/.data");
  assert.strictEqual(updated, input, "identical homeRoot should be left untouched");
}

console.log("All bootstrap-worktree helper tests passed.");
