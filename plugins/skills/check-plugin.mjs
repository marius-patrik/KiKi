import assert from "node:assert";
import * as plugin from "./lib/index.js";

assert.strictEqual(plugin.name, "skills");
assert.strictEqual(typeof plugin.apply, "function");

const ctx = { skills: null, tools: {} };
// Mirror the cordis runtime: Service construction mounts itself on the context
// through reflect.provide.
ctx.reflect = {
  provide: (name, service) => {
    ctx[name] = service;
  },
};
plugin.apply(ctx);
assert.ok(ctx.skills);
ctx.skills.loadSkill("pr-review");
assert.strictEqual(ctx.skills.hasSkill("pr-review"), true);
console.log("skills check passed");
