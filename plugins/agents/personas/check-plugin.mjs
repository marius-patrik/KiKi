import assert from "node:assert";
import * as plugin from "./lib/index.js";

assert.strictEqual(plugin.name, "personas");
assert.strictEqual(typeof plugin.apply, "function");

const ctx = { personas: null, llm: {}, sessions: {}, slots: {} };
// Mirror the cordis runtime: Service construction mounts itself on the context
// through reflect.provide.
ctx.reflect = {
  provide: (name, service) => {
    ctx[name] = service;
  },
};
plugin.apply(ctx);
assert.ok(ctx.personas);
ctx.personas.register({
  id: "coder",
  name: "Code Expert",
  role: "developer",
  systemPrompt: "Write clean code.",
});
assert.strictEqual(ctx.personas.get("coder")?.name, "Code Expert");
console.log("personas check passed");
