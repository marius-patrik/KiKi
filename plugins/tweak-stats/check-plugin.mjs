// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling extensions
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "tweak-stats-"));
process.env.HOME = root;
process.env.DSH_HOME = join(root, ".agents");

const plugin = await import("./lib/index.js");
const stats = await import("./lib/stats.js");
const { NS_STATS } = await import("./lib/settings.js");

assertLoaderShape(plugin, "tweak-stats");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

const home = join(root, ".agents");

// Boot over a stub settings service. Since 0.2.0 a plugin's Config is its form and
// the namespace is its entry id, so there is no registration to observe; what this
// plugin must declare is that it ships its own page for that form.
const ctx = new Context();
const { service: settings, registrations } = stubSettingsService();
ctx.provide("settings", settings);
plugin.apply(ctx, { enabled: true, format: "table" });
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(NS_STATS, "tweak-stats", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("boot ok");

// Stats from a planted projection cache.
const cache = {
  unit: { name: "session_projcache", version: 3 },
  global: null,
  tables: {
    sessions: {
      "session-abc": {
        identity: { createdAt: 1000, cwd: "/Users/user" },
        rows: {
          sessionStats: {
            ver: 1,
            seq: 5,
            val: {
              turns: 3,
              steps: 9,
              llmMs: 1200,
              toolMs: 800,
              ttftMs: 100,
              decodeMs: 900,
              decodeTokens: 500,
            },
          },
        },
      },
    },
  },
};
mkdirSync(join(home, "storages"), { recursive: true });
writeFileSync(join(home, "storages", "session_projcache.json"), JSON.stringify(cache));
const parsed = await stats.readProjectionCache(home);
const row = stats.sessionStatsFromCache(parsed, "session-abc");
assert.equal(row.turns, 3);
assert.equal(row.cached, true);
assert.equal(row.llmMs, 1200);
const emptyRow = stats.sessionStatsFromCache(parsed, "session-zzz");
assert.equal(emptyRow.cached, false);
const table = stats.formatTable([row, emptyRow]);
assert.ok(table.includes("session-abc".slice(0, 8)));
assert.ok(table.includes("session-zzz".slice(0, 8)));
const csv = stats.formatCsv([row]);
assert.ok(csv.startsWith("sessionId,cwd,createdAt"));
assert.ok(csv.includes("session-abc,/Users/user,1000,3,9,1200,800,100,900,500"));
const json = stats.formatJson([row]);
assert.ok(json.includes('"sessionId":"session-abc"'));
console.log("stats projection helpers ok");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
