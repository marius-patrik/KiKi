// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling extensions
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../../src/scripts/plugin-check-kit.mjs";

const plugin = await import("./lib/index.js");
const { NS_PLAN_TOGGLE } = await import("./lib/settings.js");

assertLoaderShape(plugin, "tweak-plan-toggle");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// Boot over stub settings + commands + planMode services; /build registers
// and delegates to the plan-mode controller.
const ctx = new Context();
const { service: settings, registrations } = stubSettingsService();
ctx.provide("settings", settings);
const registered = [];
ctx.provide("commands", {
  /** register implementation. */
  register(def) {
    registered.push({ name: def.name, description: def.description });
    return () => undefined;
  },
});
ctx.provide("planMode", {
  /** set implementation. */
  set(_agent, active) {
    assert.equal(active, false);
    return "committed";
  },
});
plugin.apply(ctx, { enabled: true });
await new Promise((resolve) => setTimeout(resolve, 50));

// Since 0.2.0 a plugin's Config is its form and the namespace is its entry id,
// so there is no registration to observe; what this plugin must declare is that
// it ships its own page for that form.
assert.equal(NS_PLAN_TOGGLE, "tweak-plan-toggle", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);

const names = registered.map((entry) => entry.name);
assert.ok(names.includes("build"), `plan toggle not registered: ${JSON.stringify(registered)}`);
console.log("plan toggle ok:", names.join(", "));
console.log("plugin check passed");

// jscpd:ignore-end
