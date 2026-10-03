// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "formatters-"));
const cli = new URL("./bin/formatter.mjs", import.meta.url).pathname;

const plugin = await import("./lib/index.js");
const { NS } = await import("./lib/settings.js");

assertLoaderShape(plugin, "formatters");
assert.equal(NS, "formatters", "namespace must be this plugin's entry id");
assert.equal(plugin.inject.join(","), "fs,subprocess,tools");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// settings helpers: extension matching + auto-format toggle precedence.
const { formatterFor, autoFormatEnabled } = await import("./lib/settings.js");
assert.equal(
  formatterFor({ formatters: { ".ts": { argv: ["prettier"] } } }, ".ts").argv[0],
  "prettier",
);
assert.equal(formatterFor({ formatters: {} }, ".ts"), undefined);
assert.equal(formatterFor(undefined, ".ts"), undefined);
assert.equal(autoFormatEnabled(undefined), true);
assert.equal(autoFormatEnabled({ autoFormatOnEdit: false }), false);
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

// apply: declares this plugin's own settings page, registers the `format` tool,
// and hooks `tools/post-execute`. Since 0.2.0 there is no form to register: the
// settings service projects the volatile Config fields of the active profile's
// entries, so the formatter table and the auto-format toggle arrive as `config`
// and the namespace is this plugin's entry id. What must be declared is that
// this plugin ships its own page for that form.
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
plugin.apply(actx, {
  formatters: { ".ts": { argv: [process.execPath, "-e", script] } },
  autoFormatOnEdit: true,
});
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

// Auto-format hook: an `edit` exec on the work file yields an additional
// context note with before/after; a non-formatable path delegates unchanged.
writeFileSync(workFile, "const   dirty=1;");
const hook = listeners.get("tools/post-execute")[0];
const afterEdit = await hook(
  {
    name: "edit",
    arguments: { file_path: workFile },
    callId: "c1",
    signal: new AbortController().signal,
  },
  { isError: false },
  async () => ({ kind: "accept" }),
);
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
  async () => ({ kind: "accept" }),
);
assert.equal(afterOther.additionalContexts, undefined);
console.log("auto-format hook ok (context note on formatable edit, silent otherwise)");

// The hook's reads come from the `config` this entry was applied with: a config
// with no formatter table, and a config with auto-format off, both pass an
// `edit` on the same formatable file straight through with no context note.
/**
 * Build the post-execute hook under `config` and run one edit through it.
 * @param {object} config - the resolved formatter config this entry was applied with.
 * @returns {Promise<object>} the additional contexts the hook produced.
 */
const silentHook = (config) => {
  const sctx = new Context();
  const { service } = stubSettingsService();
  sctx.provide("settings", service);
  sctx.provide("tools", { register: () => () => {} });
  sctx.baseUrl = root;
  sctx.fs = fctx.fs;
  sctx.subprocess = fctx.subprocess;
  sctx.logger = { info: () => {}, warn: () => {} };
  const captured = new Map();
  sctx.on = (event, fn) => {
    captured.set(event, [...(captured.get(event) ?? []), fn]);
    return () => {};
  };
  plugin.apply(sctx, config);
  return captured.get("tools/post-execute")[0];
};
const editExec = {
  name: "edit",
  arguments: { file_path: workFile },
  callId: "c3",
  signal: new AbortController().signal,
};
/** Approval callback that accepts the edit without prompting. */
const accept = async () => ({ kind: "accept" });
writeFileSync(workFile, "const   dirty=1;");
assert.equal(
  (await silentHook({})(editExec, { isError: false }, accept)).additionalContexts,
  undefined,
);
writeFileSync(workFile, "const   dirty=1;");
assert.equal(
  (
    await silentHook({
      formatters: { ".ts": { argv: [process.execPath, "-e", script] } },
      autoFormatOnEdit: false,
    })(editExec, { isError: false }, accept)
  ).additionalContexts,
  undefined,
);
console.log("auto-format hook reads its own config ok (no table / auto off -> silent)");

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
