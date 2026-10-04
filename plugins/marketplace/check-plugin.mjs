import assert from "node:assert";
import * as plugin from "./lib/index.js";

assert.strictEqual(plugin.name, "marketplace");
assert.deepStrictEqual(plugin.inject, []);
assert.strictEqual(typeof plugin.apply, "function");

const ctx = {};
// Mirror the cordis runtime: Service construction mounts itself on the
// context through reflect.provide.
ctx.reflect = {
  provide: (name, service) => {
    ctx[name] = service;
  },
};
plugin.apply(ctx);
assert.ok(ctx.marketplace);

// Registering a source makes it discoverable and contributes its entries.
const entryA = {
  id: "stack.example.foo",
  name: "@dsh-stack/foo",
  version: "1.0.0",
  kind: "extension",
  description: "Example entry A.",
  dependencies: [],
  optionalDependencies: [],
  install: { kind: "github-release", location: "https://example.invalid/foo" },
};
const dispose = ctx.marketplace.register({
  id: "test-source",
  /** List the single fixture entry. */
  async listEntries() {
    return [entryA];
  },
});
assert.ok(ctx.marketplace.has("test-source"));
assert.deepStrictEqual(ctx.marketplace.sourceIds(), ["test-source"]);

const entries = await ctx.marketplace.listEntries();
assert.strictEqual(entries.length, 1);
assert.strictEqual(entries[0].id, "stack.example.foo");
assert.strictEqual(entries[0].sourceId, "test-source");

// Two sources with the same id cannot both register.
assert.throws(() => {
  ctx.marketplace.register({
    id: "test-source",
    /** List no entries; only the duplicate-id rejection matters here. */
    async listEntries() {
      return [];
    },
  });
});

// Disposing a source's registration withdraws it from both discovery and
// aggregation.
dispose();
assert.strictEqual(ctx.marketplace.has("test-source"), false);
assert.deepStrictEqual(await ctx.marketplace.listEntries(), []);

// A second, independent source can register after withdrawal, and
// aggregation reflects only what is currently registered.
const entryB = { ...entryA, id: "stack.example.bar", name: "@dsh-stack/bar" };
ctx.marketplace.register({
  id: "another-source",
  /** List the second fixture entry. */
  async listEntries() {
    return [entryB];
  },
});
const finalEntries = await ctx.marketplace.listEntries();
assert.strictEqual(finalEntries.length, 1);
assert.strictEqual(finalEntries[0].id, "stack.example.bar");

console.log("marketplace check passed");
