import assert from "node:assert/strict";
import * as plugin from "./lib/index.js";
import { assertLoaderShape } from "../../scripts/plugin-check-kit.mjs";

assertLoaderShape(plugin, "automations");

// Mirror the cordis runtime: constructing a Service mounts it on the context
// through reflect.provide, which is all this plugin's apply() does.
const ctx = { automations: null };
ctx.reflect = {
  /** Mount a constructed service under its name, like cordis does. */
  provide: (serviceName, service) => {
    ctx[serviceName] = service;
  },
};
plugin.apply(ctx);
assert.ok(ctx.automations, "apply() must mount the automations registry");

// The plugin is a pure abstraction: it registers no automation of its own.
assert.deepEqual(ctx.automations.ids(), []);
assert.deepEqual(ctx.automations.all(), []);

let observed = 0;
const stopObserving = ctx.automations.observe(() => {
  observed += 1;
});

/** A stand-in automation used only to exercise the registry contract. */
const probe = {
  id: "probe",
  displayName: "Probe",
  description: "Registry contract probe.",
  triggers: ["pull-request"],
  /** Answer with a fixed outcome; the registry never inspects it. */
  run: async () => ({ status: "unchanged", summary: "probe" }),
};

const withdraw = ctx.automations.register(probe);
assert.equal(observed, 1);
assert.equal(ctx.automations.registered("probe"), true);
assert.equal(ctx.automations.resolve("probe").displayName, "Probe");
assert.deepEqual(ctx.automations.ids(), ["probe"]);
assert.deepEqual(
  ctx.automations.forTrigger("pull-request").map((automation) => automation.id),
  ["probe"],
);
assert.deepEqual(ctx.automations.forTrigger("schedule"), []);

assert.throws(() => ctx.automations.register(probe), /already registered/);
assert.throws(
  () => ctx.automations.register({ ...probe, id: "triggerless", triggers: [] }),
  /declares no trigger/,
);
assert.throws(() => ctx.automations.resolve("absent"), /no automation registered/);

withdraw();
assert.equal(observed, 2);
assert.equal(ctx.automations.registered("probe"), false);
withdraw();
assert.equal(observed, 2, "withdrawal must be idempotent");

stopObserving();
ctx.automations.register(probe);
assert.equal(observed, 2, "a stopped observer must not be notified");

console.log("automations check passed: registry mounts empty and honours the extension contract");
