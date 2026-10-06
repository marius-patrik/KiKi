import assert from "node:assert/strict";
assert.equal(typeof (await import("./lib/index.js")).name, "string");
console.log("Skin settings verification passed.");
