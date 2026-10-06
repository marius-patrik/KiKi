import assert from "node:assert";
import * as plugin from "./lib/index.js";

assert.strictEqual(plugin.name, "commands");
assert.strictEqual(typeof plugin.apply, "function");

const ctx = { commands: null, slots: {}, sessions: {}, actions: {} };
// Mirror the cordis runtime: Service construction mounts itself on the context
// through reflect.provide.
ctx.reflect = {
  provide: (name, service) => {
    ctx[name] = service;
  },
};
plugin.apply(ctx);
assert.ok(ctx.commands);
ctx.commands.register({ name: "plan", description: "Plan architecture", execute: () => {} });
assert.strictEqual(ctx.commands.list().length, 1);
console.log("commands check passed");
