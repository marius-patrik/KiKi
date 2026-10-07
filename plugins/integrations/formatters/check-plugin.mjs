// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "formatters-"));
const cli = new URL("./bin/formatter.mjs", import.meta.url).pathname;

const plugin = await import("./lib/index.js");
const { NS } = await import("./lib/settings.js");

assertLoaderShape(plugin, "formatters");
assert.equal(NS, "formatters", "namespace must be this plugin's entry id");
assert.equal(plugin.inject.join(","), "fs,subprocess,tools");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// The settings service projects an entry ONLY through its volatile fields:
// `volatileForm` returns undefined when a Config declares none, so `describe()`
// silently omits the entry and `write()` throws `Plugin entry "formatters" has no
// volatile fields`. Assert the shape first, before any behavioural read, so
// dropping either `.volatile()` from the schema is reported here as the contract
// violation it is rather than as a TypeError from a helper that called `.get()`
// on a plain value.
const sampleConfig = plugin.Config({});
assert.equal(
  typeof sampleConfig.formatters?.get,
  "function",
  "formatters must resolve to a live .volatile() reference, or the settings service omits this entry",
);
assert.equal(
  typeof sampleConfig.autoFormatOnEdit?.get,
  "function",
  "autoFormatOnEdit must resolve to a live .volatile() reference, or the settings service omits this entry",
);
assert.equal(sampleConfig.autoFormatOnEdit.get(), true, "the toggle default comes from the schema");
assert.deepEqual(sampleConfig.formatters.get(), {}, "the table default comes from the schema");
console.log("config volatile shape ok (both fields are live references)");

// settings helpers: extension matching and the auto-format toggle, read through
// the live references the schema produces.
const { FormatterConfig, formatterFor, autoFormatEnabled } = await import("./lib/settings.js");
const tsPrettier = { ".ts": { argv: ["prettier"] } };
assert.equal(formatterFor(FormatterConfig({ formatters: tsPrettier }), ".ts").argv[0], "prettier");
assert.equal(formatterFor(FormatterConfig({ formatters: {} }), ".ts"), undefined);
assert.equal(formatterFor(FormatterConfig({}), ".ts"), undefined);
assert.equal(autoFormatEnabled(FormatterConfig({})), true);
assert.equal(autoFormatEnabled(FormatterConfig({ autoFormatOnEdit: false })), false);
console.log("settings helpers ok");

// formatFile: a real subprocess formatter (node one-liner normalizing
// whitespace) over a stub fs/subprocess; before/after are read back.
const workFile = join(root, "src", "demo.ts");
mkdirSync(join(root, "src"), { recursive: true });
writeFileSync(workFile, "const   x=1;    const   y=2;");
const { formatFile, resolveTarget, targetPathFromArguments } = await import("./lib/format.js");
const script = `const fs=require('fs');fs.writeFileSync(process.argv[1],fs.readFileSync(process.argv[1],'utf8').replace(/\\s+/g,' ').trim()+'\\n')`;
const fctx = new Context();
fctx.baseUrl = root;
fctx.fs = {
  resolve: async (p) => {
    const abs = pathResolve(root, p);
    return { targetKey: `k:${abs}`, displayPath: abs };
  },
  readText: async (t) => readFileSync(t.displayPath, "utf8"),
};
fctx.subprocess = {
  spawn: (spec) => {
    const res = spawnSync(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, encoding: "utf8" });
    return {
      done: Promise.resolve({ exitCode: res.status, signal: null }),
      collected: { stderr: { readFrom: () => ({ text: res.stderr ?? "" }) } },
    };
  },
};
const target = await resolveTarget(fctx, workFile);
const outcome = await formatFile(fctx, target, { argv: [process.execPath, "-e", script] });
assert.ok(outcome.before.includes("const   x=1"));
assert.equal(outcome.after, "const x=1; const y=2;\n");
console.log("formatFile ok (real subprocess round-trip)");

// targetPathFromArguments handles snake_case and camelCase.
assert.equal(targetPathFromArguments({ file_path: "a.ts" }), "a.ts");
assert.equal(targetPathFromArguments({ filePath: "b.ts" }), "b.ts");
assert.equal(targetPathFromArguments({ path: "c.ts" }), "c.ts");
assert.equal(targetPathFromArguments({ nope: 1 }), undefined);
console.log("targetPathFromArguments ok");

// apply: parses the entry config through this plugin's own schema, declares its
// settings page, registers the `format` tool, and hooks `tools/post-execute`.
// Since 0.2.0 there is no form to register: the settings service projects the
// volatile Config fields of the active profile's entries, and the namespace is
// this plugin's entry id. What must be declared is that this plugin ships its
// own page for that form.
const config = plugin.Config({
  formatters: { ".ts": { argv: [process.execPath, "-e", script] } },
  autoFormatOnEdit: true,
});

const actx = new Context();
const { service: settings, registrations } = stubSettingsService();
actx.provide("settings", settings);
const registeredTools = [];
const listeners = new Map();
actx.provide("tools", {
  register: (def) => {
    registeredTools.push(def);
    return () => {};
  },
});
actx.baseUrl = root;
actx.fs = fctx.fs;
actx.subprocess = fctx.subprocess;
actx.logger = { info: () => {}, warn: (m) => console.log("WARN:", m) };
actx.on = (event, fn) => {
  listeners.set(event, [...(listeners.get(event) ?? []), fn]);
  return () => {};
};
plugin.apply(actx, config);
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
assert.ok(
  registeredTools.some((t) => t.name === "format"),
  "format tool not registered",
);
assert.ok(listeners.has("tools/post-execute"), "auto-format hook not registered");
console.log("apply wiring ok (settings page + format tool + post-execute hook)");

// The hook and the tool registered above are captured ONCE, before any settings
// write. Everything after this point reuses those same references.
const hook = listeners.get("tools/post-execute")[0];
const formatTool = registeredTools.find((t) => t.name === "format");
/** Approval callback that accepts the edit without prompting. */
const accept = async () => ({ kind: "accept" });
/** Run one `edit` on the work file through the captured post-execute hook. */
const runEdit = (callId) =>
  hook(
    {
      name: "edit",
      arguments: { file_path: workFile },
      callId,
      signal: new AbortController().signal,
    },
    { isError: false },
    accept,
  );
/** Run the captured `format` tool over the work file. */
const runTool = () =>
  formatTool.execute({ path: workFile }, { signal: new AbortController().signal });

// Auto-format hook: an `edit` exec on the work file yields an additional
// context note with before/after; a non-formatable path delegates unchanged.
writeFileSync(workFile, "const   dirty=1;");
const afterEdit = await runEdit("c1");
assert.equal(afterEdit.kind, "accept");
assert.ok(afterEdit.additionalContexts?.[0]?.content?.[0]?.text.includes("[auto-format]"));
assert.ok(afterEdit.additionalContexts[0].content[0].text.includes(workFile));
const afterOther = await hook(
  {
    name: "edit",
    arguments: { file_path: join(root, "notes.txt") },
    callId: "c2",
    signal: new AbortController().signal,
  },
  { isError: false },
  accept,
);
assert.equal(afterOther.additionalContexts, undefined);
console.log("auto-format hook ok (context note on formatable edit, silent otherwise)");

// The format tool runs the command the live table holds for the extension.
writeFileSync(workFile, "const   tool=1;");
assert.equal((await runTool()).after, "const tool=1;\n");
console.log("format tool ok (runs the live table's command)");

// LIVE READ. A settings write is not a remount: the Loader commits the new value
// into the very reference `apply` was handed, and the plugin must see it. The
// hook and the tool exercised here were registered before the first commit and
// are never re-applied, so a boot-time snapshot in place of `.get()` would still
// report the original table and the original toggle and go red below.
const commitVolatile = Symbol.for("cosmokit.volatile.write");

// Turning the toggle off stops the hook, with no re-apply.
config.autoFormatOnEdit[commitVolatile](false);
writeFileSync(workFile, "const   dirty=1;");
assert.equal(
  (await runEdit("c3")).additionalContexts,
  undefined,
  "the hook must honour a live autoFormatOnEdit=false commit",
);

// Swapping the table to one that no longer covers `.ts` stops the hook and
// makes the tool refuse, again with no re-apply.
config.autoFormatOnEdit[commitVolatile](true);
config.formatters[commitVolatile]({ ".py": { argv: [process.execPath, "-e", script] } });
writeFileSync(workFile, "const   dirty=1;");
assert.equal(
  (await runEdit("c4")).additionalContexts,
  undefined,
  "the hook must honour a live formatter-table swap that drops .ts",
);
await assert.rejects(
  runTool(),
  /no formatter configured/,
  "the format tool must honour a live formatter-table swap",
);

// Restoring `.ts` through the same reference brings both back.
config.formatters[commitVolatile]({ ".ts": { argv: [process.execPath, "-e", script] } });
writeFileSync(workFile, "const   dirty=1;");
assert.ok(
  (await runEdit("c5")).additionalContexts?.[0]?.content?.[0]?.text.includes("[auto-format]"),
  "restoring .ts through the live reference must bring the hook back",
);
console.log("volatile config is read live ok (toggle + table commits, no re-apply)");

// An entry with no formatter at all — the schema default — is silent, and the
// settings page policy is declared regardless.
const emptyCtx = new Context();
const { service: emptySettings, registrations: emptyRegistrations } = stubSettingsService();
emptyCtx.provide("settings", emptySettings);
emptyCtx.provide("tools", { register: () => () => {} });
emptyCtx.baseUrl = root;
emptyCtx.fs = fctx.fs;
emptyCtx.subprocess = fctx.subprocess;
emptyCtx.logger = { info: () => {}, warn: () => {} };
const emptyListeners = new Map();
emptyCtx.on = (event, fn) => {
  emptyListeners.set(event, [...(emptyListeners.get(event) ?? []), fn]);
  return () => {};
};
plugin.apply(emptyCtx, plugin.Config({}));
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(emptyRegistrations.length, 1, "settings page is declared for an empty table too");
assert.equal(emptyRegistrations[0].presentation.auto, false);
const emptyHook = emptyListeners.get("tools/post-execute")[0];
const emptyExec = {
  name: "edit",
  arguments: { file_path: workFile },
  callId: "c6",
  signal: new AbortController().signal,
};
writeFileSync(workFile, "const   dirty=1;");
assert.equal(
  (await emptyHook(emptyExec, { isError: false }, accept)).additionalContexts,
  undefined,
);
console.log("empty formatter table is silent ok");

// CLI round-trip: add/list/remove/set-auto over a temp home.
const home = join(root, "cli-home");
const env = { ...process.env, DSH_HOME: home };
execFileSync(process.execPath, [cli, "add", ".py", "black", "-q"], { env });
const text = readFileSync(join(home, "settings.yaml"), "utf8");
assert.ok(text.includes("formatters:"));
assert.ok(text.includes('".py"'));
assert.ok(text.includes("black"));
execFileSync(process.execPath, [cli, "set-auto", "off"], { env });
const text2 = readFileSync(join(home, "settings.yaml"), "utf8");
assert.ok(text2.includes("autoFormatOnEdit: false"));
execFileSync(process.execPath, [cli, "list"], { env });
execFileSync(process.execPath, [cli, "remove", ".py"], { env });
const text3 = readFileSync(join(home, "settings.yaml"), "utf8");
assert.ok(!text3.includes('".py"'));
console.log("cli settings round-trip ok");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
