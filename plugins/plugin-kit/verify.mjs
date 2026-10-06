import assert from "node:assert/strict";
import { definePack, definePlugin, defineProfile, validateCatalog } from "./lib/index.js";

const plugin = definePlugin({ id: "test.feature", version: "1.0.0", description: "test" });
const pack = definePack({
  id: "test.pack",
  version: "1.0.0",
  description: "test",
  plugins: [plugin.id],
});
const profile = defineProfile({
  id: "test",
  version: "1.0.0",
  description: "test",
  packs: [pack.id],
});

validateCatalog({ plugins: [plugin], packs: [pack], profiles: [profile] });
assert.equal(plugin.id, "test.feature");
console.log("Plugin kit verification passed.");
