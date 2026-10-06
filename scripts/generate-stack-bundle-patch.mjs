// jscpd:ignore-start -- shared release-tooling boilerplate (module header), intentionally mirrored across scripts/*.mjs
/**
 * Generates `bundles/web/cordis.patch.yml` from the Stack's own
 * pack composition, so the harness-bootable dsh.bundle for the complete
 * Stack is derived from the real, buildable pack dependency graph rather
 * than hand-maintained.
 *
 * "The complete Stack" (this generator's design choice) is the union of
 * every concrete plugin/extension package reachable from the seven domain
 * packs under `bundles/` (`ai`, `core`, `ux`, `integrations`,
 * `agents`, `trading`, `vcs`) -- i.e. every pack a Stack profile currently
 * composes -- FILTERED to the packages that actually have the cordis
 * loader shape (a built `lib/index.js` exporting a function, or an object
 * with a function `apply`; per `src/scripts/plugin-check-kit.mjs`'s
 * `assertLoaderShape`). Not every package in that union is a cordis row:
 * `stack.kind === "library"` plumbing (e.g. `@dsh-stack/plugin-kit`) and
 * packages with no host entry export no `apply` and are excluded here
 * rather than mounted. Browser-only UI packages are NOT excluded on those
 * grounds: the client-modules scanner (`harness` `dsh-client-modules`)
 * discovers `dsh.client` bundles only from mounted loader entries, so every
 * package declaring `dsh.client` carries a no-op host `apply` (the same
 * convention as the harness's own `dsh-client-ui-*` packages) and appears
 * here as a row.
 *
 * Run with `check` to verify the checked-in file is up to date instead of
 * rewriting it (used by the bundle pack's `verify` script). Both modes
 * require every candidate package's `lib/` to already be built (`bun
 * build` upstream of this script), so the loader-shape probe reflects
 * real built output, not source guesswork.
 */
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import {
  discoverStackPackages,
  emitGeneratorOutput,
  probeLoaderShape,
  rowIdFor,
  sortMountability,
} from "./lib/stack-bundle-discovery.mjs";

const mode = process.argv[2] ?? "write";
if (!["write", "check", "list"].includes(mode)) {
  console.error("usage: node generate-stack-bundle-patch.mjs <write|check|list>");
  process.exit(2);
}

const scriptDir = new URL(".", import.meta.url).pathname;
const repositoryRoot = resolve(scriptDir, "..");
const bundleManifestPath = join(repositoryRoot, "bundles", "web", "package.json");

const outputPath = join(repositoryRoot, "bundles", "web", "cordis.patch.yml");

/**
 * Packages with a real cordis loader shape (they pass {@link hasLoaderShape})
 * that still cannot be mounted as a bare `insert` row in this bundle, each
 * for its own documented reason. Reconciling these is real follow-up scope
 * -- architecture questions this generator cannot resolve on its own --
 * tracked in the issue this bundle pack's introducing PR links.
 *
 * - `@dsh-stack/agent-skills` registers the `SkillRegistry` cordis service
 *   under the same key `@deepseek-ai/dsh-skill` (mounted by every profile's
 *   `dsh-base` layer, see `harness/packages/bundle/base/cordis.patch.yml`)
 *   already provides, so mounting both aborts the boot with `service
 *   "skills" has been registered`. Does `@dsh-stack/agent-skills` replace
 *   the base row, extend it, or need a distinct service key?
 * - `@dsh-stack/agent-commands` and `@dsh-stack/agent-personas` both
 *   `inject: ["slots", ...]` a host-side cordis service named `slots` that
 *   no package anywhere in the harness or the Stack registers on the host
 *   (`slots` is a *client*-side browser concept, `@deepseek-ai/dsh-client-ui-slots`,
 *   not a cordis host service) -- boot never activates them: `dsh: entries
 *   did not activate ... waiting for service: slots`. This looks like a
 *   defect in the two packages' own host-side `inject` declarations rather
 *   than something the bundle can route around.
 */
const KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES = new Set([
  "@dsh-stack/agent-skills",
  "@dsh-stack/agent-commands",
  "@dsh-stack/agent-personas",
]);

/**
 * Static `disabled: true` overrides this generator emits verbatim, each for
 * a documented reason a pure dependency-graph derivation cannot express on
 * its own. A constituent package's own `dsh.bundle.patch` (e.g.
 * `@dsh-stack/directory-picker-fix`'s `cordis.patch.yml`) is NOT read here:
 * only a profile's *top-level* `dsh.profile.bundles` layers have their own
 * patch applied at boot, and this bundle (`@dsh-stack/bundle`) is the
 * one Stack profiles actually list there -- everything it composes arrives
 * as a bare `insert` row, so a disable that must land in the tree this
 * bundle produces has to be authored here.
 *
 * - `directory-picker` (harness's own `@deepseek-ai/dsh-host-directory-picker-auto`,
 *   inserted below as a row of its own via the union scan) mounts its
 *   resolved backend as a *dynamic* Loader entry from inside its own
 *   `apply()`; under this bundle's full concurrent boot, that dynamic mount
 *   can race a second resolution of the same entry, double-registering the
 *   `directoryPicker` cordis service and aborting the boot with `service
 *   "directoryPicker" has been registered at <...>` (dsh-stack#188 -- did not
 *   reproduce in harness's own isolated `directory-picker-auto` test suite,
 *   nor in a bare `dsh web` boot with no Stack packages composed at all; only
 *   reproduced with this bundle's full ~250-entry composition present).
 *   `@dsh-stack/directory-picker-fix` (also inserted below) replaces it with
 *   a statically-composed equivalent that reuses harness's own exported
 *   resolver, so the native/browse choice stays exactly as adaptive as
 *   before -- this disable does not hardcode one backend, it only routes
 *   around the dynamic Loader-entry path that races.
 */
const STATIC_DISABLE_ROWS = ["directory-picker"];

/**
 * Reads and parses a JSON file.
 *
 * @param {string} path - Absolute path to the JSON file.
 * @throws When the file cannot be read or contains invalid JSON.
 */
async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

/**
 * Resolves the dependency union across all domain packs, probes each candidate
 * for the cordis loader shape, and returns `{ mountable, skipped }` — sorted
 * lists of package names that can and cannot be mounted as bundle rows.
 *
 * @throws When a pack dependency cannot be resolved in the discovered packages.
 */
async function collectMountablePackageNames() {
  const byName = await discoverStackPackages(repositoryRoot);
  const bundleManifest = await readJson(bundleManifestPath);
  const union = new Set(Object.keys(bundleManifest.dependencies ?? {}));

  const mountable = [];
  const skipped = [];
  for (const name of union) {
    const found = byName.get(name);
    if (!found) throw new Error(`Stack bundle: unresolved pack dependency ${name}`);
    const { dir, manifest } = found;
    const kind = manifest.stack?.kind;
    if (kind !== "plugin" && kind !== "extension") continue;
    if (KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES.has(name)) {
      skipped.push(
        `${name} (known cordis mount incompatibility, see KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES)`,
      );
      continue;
    }
    const { mountable: isMountable } = await probeLoaderShape(dir, manifest.main);
    if (isMountable) mountable.push(name);
    else skipped.push(name);
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
    `# Produced by \`node src/scripts/generate-stack-bundle-patch.mjs write\` from the`,
    "# union of every plugin/extension package the seven domain packs under",
    "# bundles/ (ai, core, ux, integrations, agents, trading, vcs) depend on --",
    "# i.e. the complete dsh-stack catalog. Regenerate after any pack dependency",
    "# change; `bun run --filter @dsh-stack/bundle verify` fails loud on drift.",
    "#",
    "# Each row's `name` is a PACKAGE NAME resolved through the profile's own",
    "# node_modules (bun installs this bundle's full dependency closure there),",
    "# not a filesystem path. Row `id`s are derived from the package name so a",
    "# later `dsh plugin` inspection can trace a mounted row back to its source.",
    "",
  ].join("\n");

  // `name:` values are quoted: a bare `@dsh-stack/...` scalar starts with
  // YAML's reserved `@` indicator character and fails to parse unquoted.
  const rows = packageNames
    .map((name) => `    - id: ${rowIdFor(name)}\n      name: '${name}'`)
    .join("\n");

  const disables = STATIC_DISABLE_ROWS.map((id) => `- id: ${id}\n  disabled: true\n`).join("");

  return `${header}${disables}- insert:\n${rows}\n`;
}

const { mountable, skipped } = await collectMountablePackageNames();
const content = renderPatch(mountable);

await emitGeneratorOutput({
  mode,
  outputPath,
  relativeOutputPath: "bundles/web/cordis.patch.yml",
  content,
  mountable,
  skipped,
  regenerateCommand: "node src/scripts/generate-stack-bundle-patch.mjs write",
  includedLabel: "mountable plugins",
  excludedLabel: "client-only/non-cordis packages",
  excludedReasonWord: "non-cordis",
});

// jscpd:ignore-end
