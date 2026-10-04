import assert from "node:assert/strict";
import { supportedSkins } from "./lib/index.js";
assert.deepEqual(supportedSkins, ["deepseek", "claude", "codex"]);
console.log("Skin host verification passed.");
