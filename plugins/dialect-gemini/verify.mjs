import assert from "node:assert/strict";
import { geminiDialect } from "./lib/index.js";

assert.equal(geminiDialect.id, "gemini");
assert.equal(typeof geminiDialect.serialize, "function");
console.log("dialect-gemini verification passed: exports the", geminiDialect.id, "dialect helpers");
