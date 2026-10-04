import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as plugin from "./lib/index.js";
import {
  assertClientInjectIsPackageIds,
  assertLoaderShape,
} from "../../scripts/plugin-check-kit.mjs";

assertLoaderShape(plugin, "agent-loops");

const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
assertClientInjectIsPackageIds(manifest.dsh.client.inject, manifest.name);
console.log("dsh.client.inject is package ids ok:", JSON.stringify(manifest.dsh.client.inject));

console.log("loader shape ok: agent-loops inject=", JSON.stringify(plugin.inject));
console.log("plugin check passed");
