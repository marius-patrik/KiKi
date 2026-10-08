// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling extensions
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../../scripts/plugin-check-kit.mjs";

const plugin = await import("./lib/index.js");
const { validateCommand } = await import("./lib/commands.js");
const { NS_COMMANDS } = await import("./lib/settings.js");

assertLoaderShape(plugin, "tweak-slash-commands");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// Validators.
validateCommand({ name: "ping", description: "x", reply: "pong" });
assert.throws(() => validateCommand({ name: "Ping", description: "x", reply: "pong" }));
assert.throws(() => validateCommand({ name: "/ping", description: "x", reply: "pong" }));
assert.throws(() => validateCommand({ name: "ping", description: "x", reply: "  " }));
console.log("validators ok");

// Boot over a stub settings service plus the harness command registry. Since 0.2.0 a
// plugin's Config is its form and the namespace is its entry id, so there is no settings
// registration to observe; what this plugin must declare is that it ships its own page for
// that form. Its config commands are installed at load, which is what the live section's
// onChange callback used to do for the first value and for every later one.
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
const commands = {
  enabled: true,
  commands: [{ name: "ping", description: "echo", reply: "pong" }],
};
plugin.apply(ctx, commands);
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(NS_COMMANDS, "tweak-slash-commands", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
const names = registered.map((entry) => entry.name);
assert.ok(names.includes("ping"), `config command not registered: ${JSON.stringify(registered)}`);
console.log("boot ok, command registrations:", names.join(", "));

// A schema-valid command that breaks a cross-entry rule is refused at load rather than
// accepted silently: the settings service validates a write against the schema alone.
assert.throws(
  () =>
    plugin.apply(new Context(), {
      enabled: true,
      commands: [{ name: "Ping", description: "x", reply: "pong" }],
    }),
  /must be lowercase/,
);
assert.throws(
  () =>
    plugin.apply(new Context(), {
      enabled: true,
      commands: [{ name: "ping", description: "x", reply: "  " }],
    }),
  /empty reply/,
);
console.log("invalid command refused at load ok");

console.log("plugin check passed");

// jscpd:ignore-end
