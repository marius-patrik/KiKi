import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const plugin = await import("./lib/index.js");
const { validateKeybinds } = await import("./lib/keybinds.js");
const { NS_KEYBINDS } = await import("./lib/settings.js");

assertLoaderShape(plugin, "tweak-keybinds");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// Validators.
validateKeybinds([{ action: "undo", keys: "mod+z" }]);
assert.throws(() => validateKeybinds([{ action: "undo", keys: " " }]));
assert.throws(() =>
  validateKeybinds([
    { action: "undo", keys: "mod+z" },
    { action: "undo", keys: "alt+z" },
  ]),
);
console.log("validators ok");

// Boot over a stub settings service. Since 0.2.0 a plugin's Config is its form and
// the namespace is its entry id, so there is no registration to observe; what this
// plugin must declare is that it ships its own page for that form.
const ctx = new Context();
const { service: settings, registrations } = stubSettingsService();
ctx.provide("settings", settings);
plugin.apply(ctx, { enabled: true, keymap: [{ action: "undo", keys: "mod+z", when: "" }] });
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(NS_KEYBINDS, "tweak-keybinds", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("boot ok");

// An invalid keymap is refused at load rather than accepted silently: the settings
// service validates a write against the schema alone, and these are cross-entry rules.
assert.throws(
  () => plugin.apply(new Context(), { enabled: true, keymap: [{ action: "undo", keys: " " }] }),
  /empty chord/,
);
assert.throws(
  () =>
    plugin.apply(new Context(), {
      enabled: true,
      keymap: [
        { action: "undo", keys: "mod+z" },
        { action: "undo", keys: "alt+z" },
      ],
    }),
  /bound twice/,
);
console.log("invalid keymap refused at load ok");

console.log("plugin check passed");
