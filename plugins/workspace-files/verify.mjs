import assert from "node:assert/strict";
import { createFileRow, defaultFileRowActions, defaultFileSections } from "./lib/index.js";

const row = createFileRow({ id: "1", kind: "file", name: "index.ts", path: "/repo/index.ts" });
assert.deepEqual(row.actions, defaultFileRowActions);
assert.equal(row.iconRequest.extension, "ts");
assert.equal(defaultFileSections.find((section) => section.id === "host-root")?.iconTone, "muted");
console.log("Workspace file verification passed.");
