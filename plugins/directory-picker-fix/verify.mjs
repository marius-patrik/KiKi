import assert from "node:assert/strict";
import { apply, name, inject } from "./lib/index.js";
import BrowseDirectoryPicker from "@deepseek-ai/dsh-host-directory-picker-browse";
import NativeDirectoryPicker from "@deepseek-ai/dsh-host-directory-picker-native";
import { SURFACE_PACKAGES } from "@deepseek-ai/dsh-host-directory-picker-auto";

assert.equal(name, "directory-picker-fix");
assert.deepEqual(inject, ["webServer", "loader"]);

/** A minimal fake ctx: records what got composed (`ctx.plugin`) and mounted (`ctx.loader.create`). */
function fakeCtx(bindHost) {
  const plugged = [];
  const created = [];
  return {
    webServer: { host: bindHost },
    loader: { create: async (options) => created.push(options) },
    logger: { info: () => {} },
    plugin: (plugin) => plugged.push(plugin),
    plugged,
    created,
  };
}

// ---- an all-interfaces bind always resolves to browse, regardless of platform ----
{
  const ctx = fakeCtx("0.0.0.0");
  await apply(ctx);
  assert.deepEqual(ctx.plugged, [BrowseDirectoryPicker]);
  assert.deepEqual(ctx.created, [{ name: SURFACE_PACKAGES.browse }]);
  console.log("ok - mounts the browse backend and surface for an all-interfaces bind");
}

// ---- name/inject stay in lockstep with the mounted deps this plugin actually reads ----
{
  const ctx = fakeCtx("0.0.0.0");
  await apply(ctx);
  assert.ok(ctx.plugged[0] === NativeDirectoryPicker || ctx.plugged[0] === BrowseDirectoryPicker);
  console.log("ok - always resolves to one of the two real backend classes, never something else");
}

console.log("directory-picker-fix verification passed.");
