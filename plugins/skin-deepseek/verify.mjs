import assert from "node:assert/strict";
import { skinId, skinLabel } from "./lib/index.js";
assert.equal(skinId, "deepseek");
assert.equal(skinLabel, "DeepSeek");
console.log("DeepSeek skin verification passed.");
