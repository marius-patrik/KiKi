// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling extensions
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const plugin = await import("./lib/index.js");
const { forkSession } = await import("./lib/fork-undo.js");
const { NS_FORK_UNDO } = await import("./lib/settings.js");

assertLoaderShape(plugin, "tweak-fork-undo");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// Fork helper.
const forkSeed = [
  { type: "user/message", seq: 0, time: 1, data: { message: { content: "a" } } },
  { type: "assistant/message", seq: 1, time: 2, data: { message: { content: "b" } } },
  { type: "user/message", seq: 2, time: 3, data: { message: { content: "c" } } },
];
const agent = { session: { snapshotEvents: () => forkSeed } };
const forks = [];
const sessionsStub = {
  /** create implementation. */
  create(_id, opts) {
    forks.push(opts);
    return {};
  },
};
const undoResult = forkSession(sessionsStub, agent, -1);
assert.equal(undoResult.kind, "success");
assert.equal(forks[0].seed.length, 2);
const redoResult = forkSession(sessionsStub, agent, 1);
assert.equal(forks[1].seed.length, 3);
const emptyResult = forkSession(sessionsStub, { session: { snapshotEvents: () => [] } }, -1);
assert.equal(emptyResult.kind, "error");
console.log("fork helper ok");

// Boot over stub settings + commands + sessions services. Since 0.2.0 a plugin's
// Config is its form and the namespace is its entry id, so there is no
// registration to observe; what this plugin must declare is that it ships its
// own page for that form.
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
ctx.provide("sessions", sessionsStub);
plugin.apply(ctx, { enabled: true });
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(NS_FORK_UNDO, "tweak-fork-undo", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
const names = registered.map((entry) => entry.name);
assert.ok(names.includes("undo"), `undo not registered: ${JSON.stringify(registered)}`);
assert.ok(names.includes("redo"), `redo not registered: ${JSON.stringify(registered)}`);
console.log("undo/redo registrations ok:", names.join(", "));

// The page is still declared when the commands are switched off, and no command
// is registered: `enabled: false` gates only the fork-undo install.
const disabledCtx = new Context();
const { service: disabledSettings, registrations: disabledRegistrations } = stubSettingsService();
disabledCtx.provide("settings", disabledSettings);
const disabledRegistered = [];
disabledCtx.provide("commands", {
  /** register implementation. */
  register(def) {
    disabledRegistered.push({ name: def.name, description: def.description });
    return () => undefined;
  },
});
disabledCtx.provide("sessions", sessionsStub);
plugin.apply(disabledCtx, { enabled: false });
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(disabledRegistrations.length, 1, "settings page is declared regardless of enabled");
assert.equal(
  disabledRegistered.length,
  0,
  `disabled must register no command: ${JSON.stringify(disabledRegistered)}`,
);
console.log("disabled installs no command ok");
console.log("plugin check passed");

// jscpd:ignore-end
