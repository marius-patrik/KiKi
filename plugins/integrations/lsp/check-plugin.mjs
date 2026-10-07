// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "lsp-"));
const lspCli = new URL("./bin/lsp.mjs", import.meta.url).pathname;

const plugin = await import("./lib/index.js");
const { NS, LspConfig, installedServers } = await import("./lib/settings.js");

assertLoaderShape(plugin, "lsp");
assert.equal(NS, "lsp", "namespace must be this plugin's own entry id");
assert.equal(plugin.Config, LspConfig, "the exported Config must be this package's own schema");
assert.equal(typeof LspConfig, "function");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// The server table must be volatile, or this entry has no settings form at all.
// The service projects a form from the volatile fields of an entry's Config and
// drops an entry with none from `describe()` without a word (`volatileForm`:
// `if (form === undefined) return []`), after which every write to it is refused
// with `Plugin entry "lsp" has no volatile fields`. Because that projection only
// recurses into `object` schemas, `servers` — a dictionary — is projected if and
// only if the dictionary node itself carries the marker.
assert.equal(
  plugin.Config.dict.servers.meta.volatile,
  true,
  "Config.servers must be declared .volatile(), or the settings service silently omits lsp from describe() and refuses every write to it",
);

// The marker is not decoration: it makes the parsed value a live reference that
// the Loader commits each settings write into, and that snapshot is frozen.
const commitVolatile = Symbol.for("cosmokit.volatile.write");
const mountConfig = plugin.Config({
  servers: {
    typescript: {
      command: "typescript-language-server",
      extensionToLanguage: { ".ts": "typescript", ".tsx": "typescriptreact" },
      args: ["--stdio"],
    },
  },
});
assert.equal(
  typeof mountConfig.servers?.get,
  "function",
  "Config.servers must parse into a live reference, not a plain object",
);
const mounted = mountConfig.servers.get();
assert.deepEqual(Object.keys(mounted), ["typescript"]);
assert.equal(mounted.typescript.command, "typescript-language-server");
assert.deepEqual(mounted.typescript.args, ["--stdio"]);
assert.ok(
  Object.isFrozen(mounted.typescript.args),
  "a volatile snapshot is deeply frozen, which is why the reader copies args back out",
);
const installed = installedServers(mountConfig);
assert.deepEqual(installed, mounted, "the reader must hand back the table the reference holds");
assert.notEqual(
  installed.typescript.args,
  mounted.typescript.args,
  "args must be a fresh mutable array, not the frozen one from the snapshot",
);

// A settings write is committed into that same reference, and the next read must
// see it: a boot-time snapshot standing in for `.get()` keeps reporting the table
// the plugin was mounted with, which is what this assertion is here to catch.
mountConfig.servers[commitVolatile](
  Object.freeze({
    pyright: Object.freeze({
      command: "pyright-langserver",
      extensionToLanguage: { ".py": "python" },
      args: Object.freeze(["--stdio"]),
    }),
  }),
);
assert.deepEqual(
  Object.keys(installedServers(mountConfig)),
  ["pyright"],
  "the server table must be read through the live reference, not a snapshot taken at mount",
);
console.log("volatile server table ok (form projects, reference is live)");

// Boot over a stub settings service with an EMPTY config: the LSP service def
// mounts (so ctx.lsp exists) but no stdio provider/tool (server table empty).
const ctx = new Context();
const { service, registrations } = stubSettingsService();
ctx.provide("settings", service);
const warns = [];
ctx.logger = { info: () => {}, warn: (m) => warns.push(m) };
plugin.apply(ctx, plugin.Config({}));
await new Promise((resolve) => setTimeout(resolve, 200));
assert.ok(ctx.get("lsp") !== undefined, "Lsp service definition should mount");
assert.ok(warns.some((m) => m.includes("no LSP servers configured")));
// Since 0.2.0 the plugin's Config IS its form and the namespace is its entry id,
// so there is no registration to observe; what this plugin must declare is that
// it ships its own page for that form.
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("empty-table boot ok (service def mounted, no providers, guidance logged)");

// apply with a server in the plugin's own Config: the stdio provider and tool
// mount from the volatile table, with the server the reference holds (spy wraps
// real ctx.plugin and records the names and configs it is handed).
const ctx2 = new Context();
const { service: settings2 } = stubSettingsService();
ctx2.provide("settings", settings2);
const serveConfig = plugin.Config({
  servers: {
    typescript: {
      command: "typescript-language-server",
      extensionToLanguage: { ".ts": "typescript" },
      args: ["--stdio"],
    },
  },
});
const mounts = [];
const realPlugin = ctx2.plugin.bind(ctx2);
ctx2.plugin = function (mod, cfg) {
  const name = typeof mod === "object" ? mod.name : undefined;
  if (name === "lsp-stdio" || name === "tool-lsp") {
    mounts.push({ name, cfg });
    return Promise.resolve();
  }
  return realPlugin.call(this, mod, cfg);
};
ctx2.logger = { info: () => {}, warn: () => {} };
plugin.apply(ctx2, serveConfig);
await new Promise((resolve) => setTimeout(resolve, 300));
assert.ok(
  mounts.some((m) => m.name === "lsp-stdio"),
  "expected lsp-stdio mount",
);
assert.ok(
  mounts.some((m) => m.name === "tool-lsp"),
  "expected tool-lsp mount",
);
const stdio = mounts.find((m) => m.name === "lsp-stdio");
assert.deepEqual(
  Object.keys(stdio.cfg.servers),
  ["typescript"],
  "the stdio provider must be mounted with the servers the volatile table holds",
);
assert.equal(stdio.cfg.servers.typescript.command, "typescript-language-server");
assert.deepEqual(stdio.cfg.servers.typescript.args, ["--stdio"]);
console.log("mounted-provider path ok:", mounts.map((m) => m.name).join(", "));

// CLI: `dsh lsp servers add/remove/list` round-trip against a temp home.
const home = join(root, "home");
const settingsPath = join(home, "settings.yaml");
execFileSync(
  process.execPath,
  [
    lspCli,
    "servers",
    "add",
    "typescript",
    "typescript-language-server",
    "--ext=.ts=typescript",
    "--ext=.tsx=typescriptreact",
  ],
  { env: { ...process.env, DSH_HOME: home } },
);
const text = readFileSync(settingsPath, "utf8");
assert.ok(text.includes("lsp:"));
assert.ok(text.includes('"typescript"'));
assert.ok(text.includes(".ts"));
execFileSync(process.execPath, [lspCli, "list"], { env: { ...process.env, DSH_HOME: home } });
execFileSync(process.execPath, [lspCli, "servers", "remove", "typescript"], {
  env: { ...process.env, DSH_HOME: home },
});
const text2 = readFileSync(settingsPath, "utf8");
assert.ok(!text2.includes('"typescript"'));
console.log("cli settings round-trip ok");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
