/**
 * Shared repository paths and JSON reads for the verification and release
 * scripts.
 *
 * Recovered from the `wip-jscpd-exemptions-incomplete` branch (#111), retargeted
 * onto the single-plugin tree. That branch's version named `packagesDir`,
 * `extensionsDir`, `packsDir`, and `pluginsDir` as four siblings, which is a
 * layout this repository no longer has; only the two catalog roots and the two
 * helpers were worth keeping, and six scripts each carried their own copy of the
 * JSON reads.
 *
 * @module @dsh-stack/scripts/lib/repo-paths
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";

/** Repository root; every script runs from it. */
export const root = process.cwd();

/** The single implementation tree: one folder per plugin. */
export const pluginsDir = join(root, "plugins");

/** The composition tree: harness-native profile bundles. */
export const bundlesDir = join(root, "bundles");

/**
 * Catalog root names, relative to the repository root.
 *
 * Scripts that resolve the root themselves (from `import.meta.url` rather than
 * `process.cwd()`) join these onto their own root; the absolute `catalogDirs`
 * below is for the ones that do not.
 */
export const CATALOG_NAMES = ["plugins", "bundles"];

/** The absolute catalog roots, in the order composition depends on them. */
export const catalogDirs = CATALOG_NAMES.map((name) => join(root, name));

/**
 * Read and parse a UTF-8 JSON file.
 *
 * @param {string} path - Absolute path to the JSON file.
 * @returns The parsed value.
 * @throws When the file cannot be read or contains invalid JSON.
 */
export async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

/**
 * Read and parse a UTF-8 JSON file, returning null when it cannot be read.
 *
 * For the scanners that walk a catalog and skip anything without a readable
 * manifest, where an unparseable file is a skip rather than a failure.
 *
 * @param {string} path - Absolute path to the JSON file.
 * @returns The parsed value, or null.
 */
export async function readJsonOrNull(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * List the package directories in a catalog root, tolerating a missing root.
 *
 * @param {string} catalogDir - the catalog directory to list.
 * @returns absolute package directories, hidden entries excluded.
 */
export async function listCatalogDirectories(catalogDir) {
  let entries;
  try {
    entries = await fs.readdir(catalogDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(catalogDir, entry.name));
}
