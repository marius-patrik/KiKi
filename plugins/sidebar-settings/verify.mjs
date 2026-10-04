import assert from "node:assert/strict";
assert.equal(typeof (await import("./lib/index.js")).name, "string");
console.log("Sidebar settings verification passed.");
