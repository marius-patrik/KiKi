// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { assertLoaderShape, loadClientLoaderSpec } from "../../scripts/plugin-check-kit.mjs";

const plugin = await import("./lib/index.js");
assertLoaderShape(plugin, "agent-actions");
assert.deepEqual(plugin.ACTIONS, ["tool", "search", "action", "plan", "agent", "shell", "code"]);

const controller = new plugin.ActionsController("agent");
const agent = {};
assert.deepEqual(controller.get(agent), { active: "agent" });
assert.equal(controller.set(agent, "shell"), "queued");
assert.deepEqual(controller.get(agent), { active: "agent", pending: "shell" });
assert.equal(controller.commit(agent), "shell");
assert.deepEqual(controller.get(agent), { active: "shell" });
console.log("session modes controller ok");

const listeners = new Map();
const commands = [];
const routes = [];
const ctx = {
  /** provide implementation. */
  provide(name, value) {
    this[name] = value;
  },
  /**
   * Registers a listener for a specific event name.
   *
   * @param {string} name - The name of the event to listen to.
   * @param {function} listener - The function to execute when the event is triggered.
   * @returns {function} - A cleanup function to remove the listener.
   */
  on(name, listener) {
    listeners.set(name, listener);
  },
  /**
   * Registers a command definition to be executed when the command is invoked.
   *
   * @param {Object} services - The services object containing available services.
   * @param {function} callback - The function to execute with the services.
   * @returns {function} - A cleanup function to unregister the command definition.
   */
  inject(services, callback) {
    callback(this);
  },
  webServer: {
    /** register implementation. */
    register(definition) {
      routes.push(definition);
      return () => undefined;
    },
  },
  commands: {
    /** register implementation. */
    register(definition) {
      commands.push(definition);
      return () => undefined;
    },
  },
};
plugin.apply(ctx, {
  tools: { shell: ["bash"] },
  routes: { shell: { provider: "test-provider", model: "test-model" } },
});
assert.ok(commands.length >= 2);
const actionCmd = commands.find((c) => c.name === "action");
const presetCmd = commands.find((c) => c.name === "preset");
assert.ok(actionCmd);
assert.ok(presetCmd);
assert.deepEqual(actionCmd.handler({ agent, rawInput: "shell" }), {
  kind: "success",
  text: "Preset queued: shell",
});

const preStep = listeners.get("agent/pre-step");
assert.equal(typeof preStep, "function");
let appended;
agent.session = {
  /** append implementation. */
  append(type, data) {
    appended = { type, data };
  },
};
const step = await preStep({ agent, signal: new AbortController().signal }, async () => ({
  kind: "enter",
  messages: [],
}));
assert.equal(step.kind, "enter");
assert.deepEqual(appended, { type: "action/selected", data: { action: "shell" } });

const preExecute = listeners.get("tools/pre-execute");
assert.deepEqual(await preExecute({ agent, name: "bash" }, async () => ({ kind: "allow" })), {
  kind: "allow",
});
assert.equal(
  (await preExecute({ agent, name: "write" }, async () => ({ kind: "allow" }))).kind,
  "deny",
);

const request = listeners.get("agent/request");
assert.deepEqual(await request({ agent }, async () => ({ provider: "old", model: "old" })), {
  provider: "test-provider",
  model: "test-model",
});
const rejectedAgent = {
  session: { events: [{ type: "session-mode/selected", data: { mode: "plan" } }] },
};
const rejectedCommand = commands[0].handler({ agent: rejectedAgent, rawInput: "code" });
assert.equal(rejectedCommand.kind, "success");
const rejected = await preStep(
  { agent: rejectedAgent, signal: new AbortController().signal },
  async () => ({ kind: "reject" }),
);
assert.equal(rejected.kind, "reject");
assert.deepEqual(ctx.actions.get(rejectedAgent), { active: "plan", pending: "code" });
console.log("session mode hooks ok");

assert.equal(routes.length, 2);
assert.equal(routes[0].kind, "exact");
assert.equal(routes[0].path, "/actions");
assert.equal(routes[1].path, "/actions/api/reload");
const res = {
  _status: 0,
  _body: "",
  /** writeHead implementation. */
  writeHead(s, h) {
    this._status = s;
    this._headers = h;
  },
  /**
   * Ends the response by setting the body content.
   *
   * Guarantees that the response's body is set to the provided content `b`.
   * If called without providing a body, the response is still ended but without
   * setting a body.
   */
  end(b) {
    this._body = b;
  },
};
await routes[0].handler({ url: "/actions" }, res);
assert.equal(res._status, 200);
const actionsBody = JSON.parse(res._body);
assert.ok(Array.isArray(actionsBody.actions));
assert.equal(actionsBody.defaultAction, "agent");
assert.equal(actionsBody.actions.length, 7);
assert.ok(actionsBody.actions.every((a) => a.builtIn));
assert.ok(actionsBody.commands.some((c) => c.id === "reload-app"));
assert.ok(actionsBody.commands.some((c) => c.id === "force-reload"));
console.log("actions route ok");

const clientPath = new URL("./lib/client.js", import.meta.url);
assert.ok(readFileSync(clientPath, "utf8").includes("__ModuleLoader__.load"));
assert.ok(
  readFileSync(new URL("./client.js", import.meta.url), "utf8").includes("__ModuleLoader__.load"),
);
const loader = await loadClientLoaderSpec(clientPath);
assert.equal(loader.spec.id, "agent-actions");
const clientExports = loader.spec.factory((spec) => {
  if (spec === "react") return {};
  throw new Error("unexpected require: " + spec);
}, {});
assert.deepEqual(clientExports.inject, ["slots"]);
const clientRegistrants = new Map();
const clientCtx = {
  /**
   * Executes the provided function `fn` within the context of the effect.
   *
   * Guarantees that `fn` will be called exactly once.
   *
   * On failure, an error will be thrown, causing the effect to terminate.
   */
  effect(fn) {
    fn();
  },
  slots: {
    /**
     * Executes the provided function `fn` within the context of the effect.
     *
     * Guarantees that `fn` will be called exactly once and `clientExports.inject` will be called with ["slots"].
     *
     * On failure, an error will be thrown, causing the effect to terminate.
     */
    inject(name, fn) {
      clientRegistrants.set(name, fn);
    },
    /** register implementation. */
    register(spec) {
      return spec;
    },
  },
};
clientExports.apply(clientCtx);
const sessionModesSection = clientRegistrants.get("settings.section")();
assert.equal(sessionModesSection.name, "settings.section");
assert.equal(sessionModesSection.id, "actions");
assert.equal(sessionModesSection.order, 20);
assert.equal(sessionModesSection.label(), "Actions");
const sessionModesGlyph = clientRegistrants.get("settings.section.icon")();
assert.equal(sessionModesGlyph.name, "settings.section.icon");
assert.equal(sessionModesGlyph.id, "actions");
console.log("actions client ok");

// jscpd:ignore-end
