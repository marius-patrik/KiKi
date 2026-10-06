// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { Context } from "@deepseek-ai/cordis";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

// The harness' own projection rule, imported rather than reimplemented: the
// settings service decides what is editable from `volatileForm` /
// `isVolatilePath` (dsh-settings `lib/types/schema.js`), and a local copy of
// that rule could drift from the harness and turn the guard below into a
// tautology. It is not in the package's `exports` map, so it is loaded by file.
const settingsSchema = await import(
  new URL("./node_modules/@deepseek-ai/dsh-settings/lib/types/schema.js", import.meta.url).href
);
const { isVolatilePath, plainConfig, projectForm, volatileForm } = settingsSchema;

const plugin = await import("./lib/index.js");
assertLoaderShape(plugin, "voice");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// The namespace is this plugin's own Loader entry id, so the form the service
// projects and the form the client asks for cannot name different entries.
assert.equal(plugin.VOICE_NS, plugin.name, "the settings namespace must be the plugin entry id");
console.log("namespace ok:", plugin.VOICE_NS);

// Config schema validates
const config = plugin.Config;
assert.ok(config);
console.log("config schema ok");

// ── The volatile form ───────────────────────────────────────────────────────
// Since 0.2.0 the settings service projects an entry's volatile Config fields
// and nothing else: `describe()` silently omits an entry whose schema has none,
// and `write()` throws "has no volatile fields" for it. Both gates are the
// harness' own, so this asserts against them directly.
const form = volatileForm(config);
assert.ok(
  form !== undefined,
  "voice: Config declares no volatile field, so describe() omits this entry and write() refuses it",
);

/**
 * Every leaf path in the schema, so a newly added field is classified too.
 * @param {object} schema - the schemastery node to walk.
 * @param {string[]} [prefix] - the path walked to reach this node.
 * @returns {string[][]} one path per leaf.
 */
function leafPaths(schema, prefix = []) {
  if (schema.dict === undefined) return [prefix];
  return Object.entries(schema.dict).flatMap(([key, child]) => leafPaths(child, [...prefix, key]));
}
/**
 * Render a schema path as its dotted form.
 * @param {string[]} segments - the path segments.
 * @returns {string} the dotted path.
 */
const path = (segments) => segments.join(".");

const declared = leafPaths(config)
  .filter((segments) => isVolatilePath(config, segments))
  .map(path)
  .sort();

// The settings page's write set, read out of the hand-authored client bundle:
// every `set(["tts", "voice"])`-style call the Voice section makes. A field the
// page edits must be volatile (or its write is refused), and a field the page
// cannot reach must not be (or it becomes an editable form field by accident).
const clientUrl = new URL("./client.js", import.meta.url);
const clientSrc = readFileSync(clientUrl, "utf8");
const editable = [
  ...new Set(
    [...clientSrc.matchAll(/set\(\[\s*((?:"[^"]+"\s*,?\s*)+)\]\)/g)].map((match) =>
      path([...match[1].matchAll(/"([^"]+)"/g)].map((field) => field[1])),
    ),
  ),
].sort();

assert.deepEqual(
  declared,
  editable,
  "the volatile fields and the settings page's editable fields have drifted apart",
);
console.log("volatile form ok:", declared.length, "editable fields —", declared.join(", "));

// The form is the volatile projection of a real config: user choices present,
// deployment facts absent.
const projected = projectForm(form, plainConfig(config({ tts: { voice: "coral" } })));
assert.equal(projected.tts.voice, "coral");
assert.equal(projected.tts.speed, 1);
assert.equal(projected.tts.provider, "openai");
assert.equal(projected.stt.engine, "auto");
assert.equal(projected.readAloud.autoRead, false);
assert.equal(projected.tts.path, undefined, "a deployment fact must not reach the form");
assert.equal(projected.tts.timeoutMs, undefined, "a deployment fact must not reach the form");
assert.equal(projected.stt.apiBase, undefined, "a deployment fact must not reach the form");
console.log("form projection ok");

// A deployment fact is not writable through the form, which is the point of
// leaving it plain: `write()` throws "is not volatile" for such a path.
assert.equal(isVolatilePath(config, ["tts", "voice"]), true);
assert.equal(isVolatilePath(config, ["tts", "path"]), false);
assert.equal(isVolatilePath(config, ["stt", "apiBase"]), false);
console.log("volatile path gating ok");

// TTS provider table
const providers = plugin.TTS_PROVIDERS;
assert.ok(Array.isArray(providers) || typeof providers === "object");
console.log("tts providers ok");

// Auth header construction
const headers = plugin.authHeaders;
assert.equal(typeof headers, "function");
console.log("auth headers ok");

// Route factories
assert.equal(typeof plugin.makeTtsHandler, "function");
assert.equal(typeof plugin.makeSttHandler, "function");
assert.equal(typeof plugin.makeConfigHandler, "function");
console.log("route factories ok");

// Tool registration
assert.equal(typeof plugin.registerVoiceTools, "function");
console.log("tool registration ok");

// Speech functions
assert.equal(typeof plugin.synthesizeSpeech, "function");
assert.equal(typeof plugin.transcribeAudio, "function");
assert.equal(typeof plugin.resolveCredential, "function");
console.log("speech functions ok");

// ── The live read discipline ────────────────────────────────────────────────
// A volatile write is committed by the Loader into the very references the
// plugin was handed, without restarting the plugin. So the routes and the tools
// must read through `.get()` on every request; capturing the boot-time value
// would pin the entry to whatever was configured when it loaded. This stands in
// for the Loader's `updateVolatile` with the real shared commit symbol.
const commit = Symbol.for("cosmokit.volatile.write");
const live = plugin.Config();
const ctx = new Context();
const { service: settings, registrations } = stubSettingsService();
const routes = [];
ctx.provide("settings", settings);
ctx.provide("webServer", {
  /**
   * Record a registered route so the check can assert on it.
   * @param {object} route - the route the plugin registered.
   * @returns {() => undefined} disposer.
   */
  register(route) {
    routes.push(route);
    return () => undefined;
  },
});
ctx.provide("tools", { register: () => () => undefined });
ctx.provide("accounts", undefined);
plugin.apply(ctx, live);
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("plugin declares its own settings page ok");

assert.deepEqual(
  routes.map((route) => route.path),
  ["/voice/api/tts", "/voice/api/stt", "/voice/api/config"],
);

/** Minimal response double capturing the JSON a handler sends. */
function jsonRes() {
  return {
    _status: 0,
    _body: "",
    /** @param status - the response status the route replied with. */ writeHead(status) {
      this._status = status;
    },
    /** @param body - the response body the route replied with. */ end(body) {
      this._body = String(body);
    },
  };
}

const configRoute = routes.find((route) => route.path === "/voice/api/config");
const before = jsonRes();
configRoute.handler({ method: "GET" }, before);
assert.equal(before._status, 200);
assert.equal(JSON.parse(before._body).tts.voice, "nova");

// The Loader commits a settings write into these references in place.
live.tts.voice[commit]("coral");
live.stt.engine[commit]("whisper");
live.readAloud.autoRead[commit](true);

// The very next request must report the committed values, not the boot-time
// snapshot, and provider resolution (what voice_speak uses) must agree.
const after = jsonRes();
configRoute.handler({ method: "GET" }, after);
assert.equal(after._status, 200);
const published = JSON.parse(after._body);
assert.equal(published.tts.voice, "coral");
assert.equal(published.stt.engine, "whisper");
assert.equal(published.readAloud.autoRead, true);
assert.equal(plugin.resolveTts(live.tts).voice, "coral");
console.log("volatile write reaches the routes and the tools without a restart ok");

// Client bundle
assert.ok(clientSrc.includes("__ModuleLoader__.load"), "client bundle uses __ModuleLoader__");
assert.ok(clientSrc.includes("voice"), "client bundle has plugin id");
console.log("voice client ok");

console.log("plugin check passed");

// jscpd:ignore-end
