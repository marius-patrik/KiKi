import assert from "node:assert";
import { Context } from "@deepseek-ai/cordis";
import * as marketplace from "@dsh-stack/marketplace";
import * as extension from "./lib/index.js";

assert.strictEqual(extension.name, "marketplace-source-dsh-stack");
assert.deepStrictEqual(extension.inject, ["marketplace"]);
assert.strictEqual(typeof extension.apply, "function");

const FAKE_RELEASE = {
  tag_name: "v0.2.0",
  html_url: "https://github.com/marius-patrik/dsh-stack/releases/tag/v0.2.0",
  assets: [
    {
      name: "stack-release.json",
      browser_download_url:
        "https://github.com/marius-patrik/dsh-stack/releases/download/v0.2.0/stack-release.json",
    },
  ],
};
const FAKE_MANIFEST = {
  format: 1,
  packages: [
    {
      id: "stack.core.marketplace",
      name: "@dsh-stack/marketplace",
      version: "0.1.0",
      kind: "plugin",
      dependencies: [],
      optionalDependencies: [],
    },
    {
      id: "stack.core.marketplace-source.dsh-stack",
      name: "@dsh-stack/marketplace-source-dsh-stack",
      version: "0.1.0",
      kind: "extension",
      dependencies: [{ id: "stack.core.marketplace", version: "0.1.0" }],
      optionalDependencies: [],
    },
  ],
};

/** A `fetch` stub serving the two canned GitHub Releases API responses this extension requests, with no live network access. */
function fakeFetch(url) {
  const href = String(url);
  if (href === "https://api.github.com/repos/marius-patrik/dsh-stack/releases/latest") {
    return Promise.resolve({ ok: true, status: 200, json: async () => FAKE_RELEASE });
  }
  if (href === FAKE_RELEASE.assets[0].browser_download_url) {
    return Promise.resolve({ ok: true, status: 200, json: async () => FAKE_MANIFEST });
  }
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
}

const ctx = new Context();
marketplace.apply(ctx);
extension.apply(ctx, { fetchImpl: fakeFetch });

assert.ok(ctx.marketplace.has("dsh-stack"));

const entries = await ctx.marketplace.listEntries();
assert.strictEqual(entries.length, 2);
const byId = new Map(entries.map((entry) => [entry.id, entry]));

const marketplaceEntry = byId.get("stack.core.marketplace");
assert.ok(marketplaceEntry, "expected the marketplace plugin entry to be listed");
assert.strictEqual(marketplaceEntry.name, "@dsh-stack/marketplace");
assert.strictEqual(marketplaceEntry.version, "0.1.0");
assert.strictEqual(marketplaceEntry.kind, "plugin");
assert.strictEqual(marketplaceEntry.sourceId, "dsh-stack");
assert.deepStrictEqual(marketplaceEntry.install, {
  kind: "github-release",
  location: FAKE_RELEASE.html_url,
});

const sourceEntry = byId.get("stack.core.marketplace-source.dsh-stack");
assert.ok(sourceEntry, "expected the marketplace-source-dsh-stack entry to be listed");
assert.strictEqual(sourceEntry.kind, "extension");
assert.deepStrictEqual(sourceEntry.dependencies, [
  { id: "stack.core.marketplace", version: "0.1.0" },
]);

// A release with no manifest asset is a hard failure, not a silently empty catalog.
const noManifest = { tag_name: "v0.1.0", html_url: "https://example.invalid", assets: [] };
/** Fake fetch transport: serves a release that has no manifest asset. */
const brokenFetch = (url) =>
  String(url) === "https://api.github.com/repos/marius-patrik/dsh-stack/releases/latest"
    ? Promise.resolve({ ok: true, status: 200, json: async () => noManifest })
    : Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
const brokenCtx = new Context();
marketplace.apply(brokenCtx);
extension.apply(brokenCtx, { fetchImpl: brokenFetch });
await assert.rejects(() => brokenCtx.marketplace.listEntries(), /has no stack-release\.json asset/);

console.log("marketplace-source-dsh-stack verification passed:", entries.length, "entries");
