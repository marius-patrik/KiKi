import assert from "node:assert/strict";
import { skinId, skinLabel } from "./lib/index.js";
assert.equal(skinId, "claude");
assert.equal(skinLabel, "Claude");
console.log("Claude skin verification passed.");
