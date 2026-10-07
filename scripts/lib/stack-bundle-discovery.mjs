/**
 * Shared package-discovery primitives for the Stack bundle-patch generators
 * (`generate-stack-bundle-patch.mjs`'s full bundle and
 * `generate-stack-bundle-headless-patch.mjs`'s headless-safe subset): scanning
 * `plugins`/`plugins` for package manifests, probing a
 * candidate's built entry for the cordis loader shape (and its declared
 * `inject` list), and deriving a YAML-safe row id from a package name.
 *
 * @module @dsh-stack/scripts/lib/stack-bundle-discovery
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOG_NAMES, listCatalogDirectories, readJson } from "./repo-paths.mjs";



/**
 * Scans `plugins/` and `bundles/` for package directories,
 * returning a Map of package name to `{ dir, manifest }`.
 *
 * Directories without a readable `package.json` or without a string `name`
 * field are silently skipped.
 *
 * @param {string} repositoryRoot - Absolute path to the repository root.
 */
export async function discoverStackPackages(repositoryRoot) {
  const byName = new Map();
  for (const catalogRoot of CATALOG_NAMES) {
    const catalogDir = join(repositoryRoot, catalogRoot);
    for (const dir of await listCatalogDirectories(catalogDir)) {
      try {
        const manifest = await readJson(join(dir, "package.json"));
        if (typeof manifest.name === "string") byName.set(manifest.name, { dir, manifest });
      } catch {
        // not every entry is a package (e.g. stray files); skip silently.
      }
    }
  }
  return byName;
}

/**
 * Probes whether a package's built entry exports a cordis-compatible loader
 * shape, returning its declared `inject` list alongside the yes/no verdict so
 * callers can filter on required services without a second dynamic import.
 *
 * Dynamic-imports the resolved entry and returns `{ mountable: true, inject }`
 * when the module exports an `apply` function (either directly or via
 * `default`). Returns `{ mountable: false, inject: [] }` without throwing
 * when the entry cannot be imported.
 *
 * @param {string} packageDir - Absolute path to the package root.
 * @param {string|undefined} mainRelativePath - Relative entry path; defaults to `lib/index.js`.
 */
export async function probeLoaderShape(packageDir, mainRelativePath) {
  const entryPath = join(packageDir, mainRelativePath ?? "lib/index.js");
  let mod;
  try {
    mod = await import(pathToFileURL(entryPath).href);
  } catch {
    return { mountable: false, inject: [] };
  }
  if (typeof mod.apply === "function") {
    const mountable = typeof mod.name === "string" && mod.default === undefined;
    return { mountable, inject: Array.isArray(mod.inject) ? mod.inject : [] };
  }
  if (mod.default && typeof mod.default === "object" && typeof mod.default.apply === "function") {
    return { mountable: true, inject: Array.isArray(mod.default.inject) ? mod.default.inject : [] };
  }
  return { mountable: false, inject: [] };
}

/**
 * Sorts a generator's `mountable`/`skipped` package-name lists alphabetically
 * in place and returns them as `{ mountable, skipped }`, the shape both
 * bundle-patch generators' own `collect*PackageNames()` resolve to.
 *
 * @param {string[]} mountable
 * @param {string[]} skipped
 */
export function sortMountability(mountable, skipped) {
  mountable.sort((a, b) => a.localeCompare(b));
  skipped.sort((a, b) => a.localeCompare(b));
  return { mountable, skipped };
}

/**
 * Derives a YAML-safe cordis row id from a scoped package name by stripping
 * the `@dsh-stack/` prefix and replacing slashes with hyphens.
 *
 * @param {string} packageName - Scoped Stack package name.
 */
export function rowIdFor(packageName) {
  return packageName.replace(/^@dsh-stack\//, "").replaceAll("/", "-");
}

/**
 * Shared `write`/`check`/`list` mode dispatch for a bundle-patch generator:
 * `list` prints `{ mountable, skipped }` as JSON, `check` fails loud (exit 1)
 * when the checked-in file doesn't match freshly-rendered content, and
 * `write` overwrites it. Both generator scripts (the full bundle and its
 * headless-safe subset) share this driver, parameterized only by the strings
 * that differ between them.
 *
 * @param {object} options
 * @param {"write"|"check"|"list"} options.mode
 * @param {string} options.outputPath - Absolute path to the generated file.
 * @param {string} options.relativeOutputPath - Repo-relative path, for messages.
 * @param {string} options.content - Freshly-rendered file content.
 * @param {string[]} options.mountable - Package names included in `content`.
 * @param {string[]} options.skipped - Package names excluded, each already
 *   annotated with its own reason.
 * @param {string} options.regenerateCommand - The `node ...write` command to
 *   suggest when `check` finds drift.
 * @param {string} options.includedLabel - Noun phrase for an included row,
 *   e.g. "mountable plugins" or "headless-safe plugins".
 * @param {string} options.excludedLabel - Noun phrase for the excluded set,
 *   e.g. "client-only/non-cordis packages" or "web-only packages".
 * @param {string} options.excludedReasonWord - Short adjective for the
 *   `write`-mode summary, e.g. "non-cordis" or "web-only".
 */
export async function emitGeneratorOutput(options) {
  const {
    mode,
    outputPath,
    relativeOutputPath,
    content,
    mountable,
    skipped,
    regenerateCommand,
    includedLabel,
    excludedLabel,
    excludedReasonWord,
  } = options;

  if (mode === "list") {
    // Machine-readable mode: emits this script's mountability decision as JSON
    // so verifiers gate on the exact same mount/skip computation instead of
    // re-deriving (and drifting from) the loader-shape probe.
    console.log(JSON.stringify({ mountable, skipped }));
    return;
  }
  if (mode === "check") {
    let existing;
    try {
      existing = await fs.readFile(outputPath, "utf8");
    } catch {
      existing = undefined;
    }
    if (existing !== content) {
      console.error(
        `${relativeOutputPath} is stale (${mountable.length} ${includedLabel} expected). ` +
          `Run \`${regenerateCommand}\` to regenerate.`,
      );
      process.exit(1);
    }
    console.log(
      `${relativeOutputPath} is up to date: ${mountable.length} ${includedLabel}, ` +
        `${skipped.length} ${excludedLabel} excluded.`,
    );
    return;
  }
  await fs.writeFile(outputPath, content);
  console.log(
    `Wrote ${relativeOutputPath}: ${mountable.length} ${includedLabel} ` +
      `(excluded as ${excludedReasonWord}: ${skipped.join(", ") || "none"}).`,
  );
}
