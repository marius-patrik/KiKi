import assert from "node:assert/strict";
import { createSkinRuntime } from "./lib/index.js";

let reloads = 0;
const runtime = createSkinRuntime(undefined, () => {
  reloads += 1;
});
assert.equal(runtime.getActive(), "deepseek");
runtime.setActive("claude");
assert.equal(runtime.getActive(), "claude");
assert.equal(reloads, 1);
assert.throws(() => runtime.setActive("missing"));
console.log("Skin runtime verification passed.");
