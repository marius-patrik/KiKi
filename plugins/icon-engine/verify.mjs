import assert from "node:assert/strict";
import { IconEngine } from "./lib/index.js";

const engine = new IconEngine();
engine.registerPack({
  id: "fallback",
  label: "Fallback",
  priority: 0,
  resolve: (key) => (key === "extension:ts" ? "fallback-ts" : null),
});
engine.registerPack({
  id: "priority",
  label: "Priority",
  priority: 100,
  resolve: (key) => (key === "extension:ts" ? "priority-ts" : null),
});
assert.equal(engine.resolve({ extension: ".ts" }), "priority-ts");
assert.equal(engine.packsList()[0]?.id, "priority");
assert.equal(engine.resolve({ extension: ".unknown" }), "file");
assert.throws(() =>
  engine.registerPack({ id: "priority", label: "Duplicate", resolve: () => "x" }),
);
console.log("Icon engine priority verification passed.");
