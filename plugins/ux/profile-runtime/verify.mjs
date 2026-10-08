import assert from "node:assert/strict";
import { createProfileRuntime } from "./lib/index.js";

let reloads = 0;
const runtime = createProfileRuntime(
  [
    { id: "default", label: "Default" },
    { id: "coding", label: "Coding" },
  ],
  {
    reload: () => {
      reloads += 1;
    },
  },
);
assert.equal(runtime.getActive(), "default");
runtime.setActive("coding");
assert.equal(runtime.getActive(), "coding");
assert.equal(reloads, 1);
assert.throws(() => runtime.setActive("missing"));
console.log("Profile runtime verification passed.");
