// jscpd:ignore-start -- shared release-tooling boilerplate (module header), intentionally mirrored across scripts/*.mjs
/**
 * Generates `publish/packs/bundle-headless/cordis.patch.yml`: the same
 * union computation `generate-stack-bundle-patch.mjs` uses for the full
 * Stack bundle, filtered to the packages that are safe to compose under
 * `dsh --profile headless` -- a one-shot CLI dispatch with no web server or
 * dynamic Loader tree, unlike the `web` profile every other Stack package
 * assumes.
 *
 * "Headless-safe" (this generator's design choice) means the candidate's
 * declared `inject` list names neither `webServer` nor `loader`: headless
 * boots never compose harness's `dsh-host-webserver` (there is no HTTP
 * server to bind) or its dynamic Loader-entry machinery those two services
 * gate, so a package requiring either would sit forever at `pending
 * (waiting for service: ...)` rather than actually mount (dsh-stack#213,
 * following the same real, live-boot-diagnosed gap #187/#212 first
 * surfaced: headless composes zero @dsh-stack/* packages by default).
 * Filtering on the built `inject` array (not a hand-maintained exclusion
 * list) means a newly added package is included or excluded correctly
 * without this generator needing to know about it by name.
 *
 * Run with `check` to verify the checked-in file is up to date instead of
 * rewriting it (used by the bundle-headless pack's `verify` script). Both
 * modes require every candidate package's `lib/` to already be built (`bun
 * build` upstream of this script), so the loader-shape probe reflects real
 * built output, not source guesswork.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { resolveRepoRoot } from "./lib/resolve-repo-root.mjs";
import {
  discoverStackPackages,
  emitGeneratorOutput,
  probeLoaderShape,
  rowIdFor,
  sortMountability,
} from "./lib/stack-bundle-discovery.mjs";

/** Injected service names that gate the web-only surfaces a headless boot never composes. */
const WEB_ONLY_SERVICES = new Set(["webServer", "loader"]);

const mode = process.argv[2] ?? "write";
if (!["write", "check", "list"].includes(mode)) {
  console.error("usage: node generate-stack-bundle-headless-patch.mjs <write|check|list>");
  process.exit(2);
}

const repositoryRoot = resolveRepoRoot(import.meta.url);
const bundlePatchPath = join(repositoryRoot, "publish", "packs", "bundle", "cordis.patch.yml");
const outputPath = join(repositoryRoot, "publish", "packs", "bundle-headless", "cordis.patch.yml");

/**
 * Reads the full bundle's generated `insert` row package names straight out
 * of `publish/packs/bundle/cordis.patch.yml`, so this generator's candidate
 * set is always exactly "whatever the full bundle mounts" -- never a second,
 * independently-drifting union computation over the seven domain packs.
 *
 * @throws When the full bundle's patch file is missing or has no rows (run
 *   `generate-stack-bundle-patch.mjs write` first).
 */
async function readFullBundlePackageNames() {
  const content = await fs.readFile(bundlePatchPath, "utf8");
  const names = [...content.matchAll(/^ {6}name: '([^']+)'$/gm)].map((match) => match[1]);
  if (names.length === 0) {
    throw new Error(
      "Stack headless bundle: publish/packs/bundle/cordis.patch.yml has no insert rows -- " +
        "run `node src/scripts/generate-stack-bundle-patch.mjs write` first.",
    );
  }
  return names;
}

/**
 * Probes every full-bundle package for its declared `inject` list and
 * returns `{ mountable, skipped }` — sorted lists of package names that are
 * and are not safe to compose under a headless boot.
 */
async function collectHeadlessSafePackageNames() {
  const byName = await discoverStackPackages(repositoryRoot);
  const candidates = await readFullBundlePackageNames();

  const mountable = [];
  const skipped = [];
  for (const name of candidates) {
    const found = byName.get(name);
    if (!found) throw new Error(`Stack headless bundle: unresolved bundle package ${name}`);
    const { dir, manifest } = found;
    const { inject } = await probeLoaderShape(dir, manifest.main);
    if (inject.some((service) => WEB_ONLY_SERVICES.has(service))) {
      skipped.push(
        `${name} (injects ${inject.filter((s) => WEB_ONLY_SERVICES.has(s)).join(", ")})`,
      );
      continue;
    }
    mountable.push(name);
  }
  return sortMountability(mountable, skipped);
}

/**
 * Renders the complete `cordis.patch.yml` content for the given package names,
 * including the generated-file header comment and one `insert` row per package
 * with quoted `name` values (YAML requires quoting the `@` prefix).
 */
function renderPatch(packageNames) {
  const header = [
    "# GENERATED FILE -- do not hand-edit.",
    "#",
    "# Produced by `node src/scripts/generate-stack-bundle-headless-patch.mjs write`",
    "# from publish/packs/bundle/cordis.patch.yml's own package list, filtered to",
    "# packages whose built `inject` array names neither `webServer` nor `loader` --",
    "# the two services a headless boot never composes (dsh-stack#213). Regenerate",
    "# after regenerating the full bundle; `bun run --filter @dsh-stack/pack-bundle-headless",
    "# run verify` fails loud on drift.",
    "#",
    "# Each row's `name` is a PACKAGE NAME resolved through the profile's own",
    "# node_modules, not a filesystem path. Row `id`s are derived from the package",
    "# name so a later `dsh plugin` inspection can trace a mounted row back to its",
    "# source.",
    "",
  ].join("\n");

  const rows = packageNames
    .map((name) => `    - id: ${rowIdFor(name)}\n      name: '${name}'`)
    .join("\n");

  return `${header}- insert:\n${rows}\n`;
}

const { mountable, skipped } = await collectHeadlessSafePackageNames();
const content = renderPatch(mountable);

await emitGeneratorOutput({
  mode,
  outputPath,
  relativeOutputPath: "publish/packs/bundle-headless/cordis.patch.yml",
  content,
  mountable,
  skipped,
  regenerateCommand: "node src/scripts/generate-stack-bundle-headless-patch.mjs write",
  includedLabel: "headless-safe plugins",
  excludedLabel: "web-only packages",
  excludedReasonWord: "web-only",
});

// jscpd:ignore-end
