/**
 * Shared repository paths and JSON reads for verification/release tooling.
 *
 * KiKi's first-level plugin folders are logical groups only; package discovery
 * happens one level below them.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";

export const root = process.cwd();
export const pluginsDir = join(root, "plugins");
export const PLUGIN_GROUP_NAMES = ["agents", "ai", "core", "integrations", "trading", "ux", "vcs"];
export const pluginGroupDirs = PLUGIN_GROUP_NAMES.map((name) => join(pluginsDir, name));

/** Read and parse a UTF-8 JSON file. */
export async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

/** Read JSON or return null when the file is absent/unreadable. */
export async function readJsonOrNull(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/** List native package directories under all logical plugin groups. */
export async function listPluginPackageDirs() {
  const dirs = [];
  for (const groupDir of pluginGroupDirs) {
    let entries = [];
    try {
      entries = await fs.readdir(groupDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        dirs.push(join(groupDir, entry.name));
      }
    }
  }
  return dirs.sort();
}
