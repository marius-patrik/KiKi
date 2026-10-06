/**
 * Fails when a canonical package is unreachable: neither mounted into the
 * bundle, nor imported by another package, nor exposed as a CLI.
 *
 * The existing gates cannot catch this class. `knip` treats every package's
 * `src/index.ts` as an *entry point*, and an entry is by definition a root of
 * reachability -- so knip never asks whether anything imports it, and every
 * canonical package self-certifies as live. `jscpd` compares text, so two
 * independent implementations of one feature (a typed reducer in one package,
 * inline React in another) register zero clones. `verify-stack.mjs` compares
 * whole-file hashes, which only finds byte-identical copies.
 *
 * The result was an entire tab implementation sitting in the tree looking
 * canonical while the running UI used a different one, and a fix landing in the
 * dead copy. This gate asks the one question none of the others do: can the
 * running system actually reach this code?
 *
 * @module @dsh-stack/scripts/verify-package-reachability
 */
import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { resolveRepoRoot } from "./lib/resolve-repo-root.mjs";
import { walkSourceTree } from "./lib/walk-source-tree.mjs";

const root = resolveRepoRoot(import.meta.url);

/**
 * Package roots scanned for reachability, relative to the repository root.
 * Packs are excluded: a pack is a composition manifest and is reached by being
 * installed, not by being imported.
 */
const PACKAGE_ROOTS = ["plugins"];

/**
 * Source roots searched for imports of one package by another.
 */
const IMPORT_SEARCH_ROOTS = ["plugins", "plugins", "", "scripts"];

/**
 * Roots whose `package.json` dependency lists compose extensions into packs.
 * A pack depending on an extension is how that extension reaches the running
 * system, so those edges count -- but only for extensions. A *plugin* is a
 * mount point: being listed as a pack dependency does not make it run, because
 * the bundle generator drops plugins that export no host entry.
 */
const COMPOSITION_ROOTS = ["bundles"];

/**
 * Yields `{ dir, manifest }` for every immediate child of `rootName` that has a
 * named package.json. Shared by the composition scan and package discovery so
 * the directory-walk shape exists once.
 */
async function* readPackageManifests(rootName) {
  const base = join(root, rootName);
  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const manifest = await readJsonOrNull(join(dir, "package.json"));
    if (manifest?.name) yield { dir, manifest };
  }
}

/** Adds every `@dsh-stack/*` dependency edge declared by a pack or plugin manifest. */
async function collectCompositionEdges() {
  const composed = new Set();
  for (const rootName of COMPOSITION_ROOTS) {
    for await (const { manifest } of readPackageManifests(rootName)) {
      for (const dep of Object.keys(manifest.dependencies ?? {})) {
        if (dep.startsWith("@dsh-stack/") && dep !== manifest.name) composed.add(dep);
      }
    }
  }
  return composed;
}

/**
 * Packages allowed to be unreachable, each with the reason it is exempt.
 * An entry here is a deliberate, reviewed decision -- not a way to silence the
 * gate. Anything added without a real reason defeats the check.
 */
const ALLOWED_UNREACHABLE = new Map([
  [
    "@dsh-stack/agent-skills",
    "declared in KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs)",
  ],
  [
    "@dsh-stack/agent-commands",
    "declared in KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs)",
  ],
  [
    "@dsh-stack/agent-personas",
    "declared in KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs)",
  ],
  [
    "@dsh-stack/dialect-claude",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-anthropic-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-antigravity-sub",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-cerebras-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-claude-sub",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-deepseek-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-gemini-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-gemini-sub",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-grok-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-grok-sub",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-groq-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-kimi-code",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-kimi-sub",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-llamacpp",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-mistral-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-ollama",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-openai-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-openrouter-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-vllm",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-zai-api",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  [
    "@dsh-stack/provider-zen",
    "unreachable since the pack indirection was deleted in #308: the only thing citing this package was a pack dependencies block, never a mount or an import. Mount-or-delete is #309.",
  ],
  // Pre-existing dead packages, each tracked for resolution by #123. They are
  // listed so this gate can hold the line from now on rather than being
  // switched off: nothing NEW may become unreachable. Delete an entry by fixing
  // the package, never to quiet the gate.
  ["@dsh-stack/composition", "pre-existing dead plugin, tracked by #123"],
  ["@dsh-stack/workspace-files", "pre-existing dead plugin, tracked by #123"],
  ["@dsh-stack/automations", "orphaned plugin scaffold, tracked by #60 and #123"],
  ["@dsh-stack/trading-market-data", "pre-existing dead plugin, tracked by #123"],
  ["@dsh-stack/trading-optimizer", "pre-existing dead plugin, tracked by #123"],
]);

/** Reads and parses one JSON file, returning null when it does not exist. */
async function readJsonOrNull(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Every package name mounted by the generated bundle patch. Absent patch file
 * means nothing is known to be mounted, which the caller reports rather than
 * treating as "everything is dead".
 */
async function readMountedNames() {
  const patch = join(root, "bundles", "web", "cordis.patch.yml");
  let text;
  try {
    text = await fs.readFile(patch, "utf8");
  } catch {
    return null;
  }
  return new Set(text.match(/@dsh-stack\/[a-z0-9-]+/g) ?? []);
}

/** Collects `{ name, dir, hasBin }` for every package under the scanned roots. */
async function discoverPackages() {
  const found = [];
  for (const rootName of PACKAGE_ROOTS) {
    for await (const { dir, manifest } of readPackageManifests(rootName)) {
      found.push({
        name: manifest.name,
        dir,
        hasBin: Boolean(manifest.bin),
        hasClient: Boolean(manifest.dsh?.client),
        kind: manifest.stack?.kind ?? "",
      });
    }
  }
  return found;
}

/**
 * Every `@dsh-stack/*` package name that appears as an import specifier in some
 * package's source, mapped to the packages importing it. A package importing
 * itself does not count.
 */
async function collectImporters(packages) {
  const byDir = new Map(packages.map((pkg) => [pkg.dir, pkg.name]));
  const importers = new Map();
  for (const rootName of IMPORT_SEARCH_ROOTS) {
    for await (const file of walkSourceTree(join(root, rootName))) {
      if (!/\.(ts|tsx|mjs|js|json)$/.test(file)) continue;
      if (file.endsWith("package.json")) continue;
      let text;
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      let owner;
      for (const [dir, name] of byDir) {
        if (file.startsWith(`${dir}/`)) {
          owner = name;
          break;
        }
      }
      for (const specifier of text.match(/@dsh-stack\/[a-z0-9-]+/g) ?? []) {
        if (specifier === owner) continue;
        if (!importers.has(specifier)) importers.set(specifier, new Set());
        importers.get(specifier).add(owner ?? relative(root, file));
      }
    }
  }
  return importers;
}

const mounted = await readMountedNames();
if (mounted === null) {
  console.error(
    "verify-package-reachability: bundles/web/cordis.patch.yml is missing.\n" +
      "Run `bun run build` first -- reachability cannot be judged without the generated bundle patch.",
  );
  process.exit(1);
}

const packages = await discoverPackages();
const importers = await collectImporters(packages);
const composed = await collectCompositionEdges();

const unreachable = [];
for (const pkg of packages) {
  if (mounted.has(pkg.name)) continue;
  if (pkg.hasBin) continue;
  if (pkg.hasClient) continue;
  // An extension reaches the system by being composed into a pack; a plugin is a
  // mount point and must actually mount or ship a browser half.
  if (pkg.kind === "extension" && composed.has(pkg.name)) continue;
  if ((importers.get(pkg.name)?.size ?? 0) > 0) continue;
  if (ALLOWED_UNREACHABLE.has(pkg.name)) continue;
  unreachable.push(pkg.name);
}

if (unreachable.length > 0) {
  console.error(
    `verify-package-reachability: ${unreachable.length} package(s) cannot be reached by the running system.\n\n` +
      unreachable.map((name) => `  - ${name}`).join("\n") +
      "\n\nEach is neither mounted in bundles/web/cordis.patch.yml, nor imported by\n" +
      "another package, nor exposed as a CLI via a bin entry. Code in this state looks\n" +
      "canonical but never runs, so a fix landing there changes nothing a user sees.\n\n" +
      "Resolve it, do not exempt it: mount the package, make its owner import it, delete it,\n" +
      "or fold it into whichever implementation is actually live. Add to ALLOWED_UNREACHABLE\n" +
      "only for a reviewed structural reason, stating that reason.\n",
  );
  process.exit(1);
}

console.log(
  `Package reachability verified: ${packages.length} packages, ` +
    `${ALLOWED_UNREACHABLE.size} documented exemptions.`,
);
