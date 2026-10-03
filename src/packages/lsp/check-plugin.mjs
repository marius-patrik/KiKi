// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "lsp-"));
const lspCli = new URL("./bin/lsp.mjs", import.meta.url).pathname;

const plugin = await import("./lib/index.js");
const { NS, LspConfig } = await import("./lib/settings.js");

assertLoaderShape(plugin, "lsp");
assert.equal(NS, "lsp", "namespace must be this plugin's own entry id");
assert.equal(typeof LspConfig, "function");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// Boot over a stub settings service with an EMPTY config: the LSP service def
// mounts (so ctx.lsp exists) but no stdio provider/tool (server table empty).
const ctx = new Context();
const { service, registrations } = stubSettingsService();
ctx.provide("settings", service);
const warns = [];
ctx.logger = { info: () => {}, warn: (m) => warns.push(m) };
plugin.apply(ctx, {});
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
// mount from config.servers (spy wraps real ctx.plugin and records).
const ctx2 = new Context();
const { service: settings2 } = stubSettingsService();
ctx2.provide("settings", settings2);
const mounts = [];
const realPlugin = ctx2.plugin.bind(ctx2);
ctx2.plugin = function (mod, cfg) {
  const name = typeof mod === "object" ? mod.name : undefined;
  if (name === "lsp-stdio" || name === "tool-lsp") {
    mounts.push(name);
    return Promise.resolve();
  }
  return realPlugin.call(this, mod, cfg);
};
ctx2.logger = { info: () => {}, warn: () => {} };
plugin.apply(ctx2, {
  servers: {
    typescript: {
      command: "typescript-language-server",
      extensionToLanguage: { ".ts": "typescript" },
      args: ["--stdio"],
    },
  },
});
await new Promise((resolve) => setTimeout(resolve, 300));
assert.ok(mounts.includes("lsp-stdio"), "expected lsp-stdio mount");
assert.ok(mounts.includes("tool-lsp"), "expected tool-lsp mount");
console.log("mounted-provider path ok:", mounts.join(", "));
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
