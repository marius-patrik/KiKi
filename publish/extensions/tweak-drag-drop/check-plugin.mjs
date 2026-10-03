// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling extensions
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../../src/scripts/plugin-check-kit.mjs";

const plugin = await import("./lib/index.js");
const { NS_DRAG_DROP } = plugin;

assertLoaderShape(plugin, "tweak-drag-drop");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// Boot over a stub settings service. Since 0.2.0 a plugin's Config is its form and
// the namespace is its entry id, so there is no registration to observe; what this
// plugin must declare is that it ships its own page for that form.
const ctx = new Context();
const { service: settings, registrations } = stubSettingsService();
ctx.provide("settings", settings);
plugin.apply(ctx, { enabled: true, maxImageBytes: 1024 });
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(NS_DRAG_DROP, "tweak-drag-drop", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("boot ok");
console.log("plugin check passed");

// jscpd:ignore-end
