import assert from "node:assert/strict";
import { skinId, skinLabel } from "./lib/index.js";
assert.equal(skinId, "codex");
assert.equal(skinLabel, "Codex");
console.log("Codex skin verification passed.");
