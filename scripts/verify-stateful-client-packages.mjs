// jscpd:ignore-start -- shared release-tooling boilerplate (module header), intentionally mirrored across scripts/*.mjs
/**
 * Fails when a `@dsh-stack/*` package that owns mutable client-side state
 * shared across more than one UI surface does not declare `dsh.client`.
 *
 * `src/scripts/client-runtime/client-bundle.ts` inlines every `@dsh-stack/*`
 * dependency into each consuming client bundle unless the package declares
 * `dsh.client` (see `.agents/notes/decisions/client-state-sharing.md`). A
 * stateful package left undeclared silently forks into one independent
 * instance per bundle it is inlined into -- exactly what happened to
 * `sidebar-preferences` and `skin-runtime` before #108, and what stopped
 * `skin-runtime`'s private-mode/blocked-storage fallback from working
 * consistently across surfaces.
 *
 * STATEFUL_CLIENT_PACKAGES is a reviewed allow-list, not an inferred set:
 * classifying "holds mutable state shared across bundles" requires reading
 * the package, so a human decision adds an entry here in the same PR that
 * introduces the state. A stateless package (pure components, constants --
 * `settings-panel`, the skin brand-mark packages) never belongs on this list;
 * duplicating it across bundles costs bundle size, not correctness.
 *
 * @module @dsh-stack/scripts/verify-stateful-client-packages
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRepoRoot } from "./lib/resolve-repo-root.mjs";

const root = resolveRepoRoot(import.meta.url);
// jscpd:ignore-end

/**
 * `@dsh-stack/*` packages known to own mutable state shared across more than
 * one client bundle. Each must declare `dsh.client` and provide its state as
 * a single cordis service (see #108's fix and the decision note above) --
 * add an entry here only alongside that conversion, in the same PR.
 */
const STATEFUL_CLIENT_PACKAGES = ["@dsh-stack/sidebar-preferences", "@dsh-stack/skin-runtime"];

/**
 * Resolves a `@dsh-stack/<name>` package id to its package.json path under
 * `plugins/<name>`.
 *
 * @param {string} packageId - full `@dsh-stack/<name>` package name.
 * @returns {string} absolute path to that package's package.json.
 */
function packageJsonPath(packageId) {
  const name = packageId.replace(/^@dsh-stack\//, "");
  return join(root, "plugins", name, "package.json");
}

const violations = [];
for (const packageId of STATEFUL_CLIENT_PACKAGES) {
  const path = packageJsonPath(packageId);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    violations.push(`${packageId}: could not read ${path} (${error.message})`);
    continue;
  }
  if (!pkg.dsh?.client) {
    violations.push(
      `${packageId} is listed as owning shared client state but does not declare ` +
        "dsh.client in its package.json -- it will fork into one independent instance " +
        "per bundle it is inlined into. Promote it to a dsh.client plugin providing its " +
        "state as a cordis service (see .agents/notes/decisions/client-state-sharing.md).",
    );
  }
}

if (violations.length > 0) {
  for (const message of violations) console.error(message);
  process.exit(1);
}

console.log(
  `Stateful client packages verified: ${STATEFUL_CLIENT_PACKAGES.length} package(s), all declaring dsh.client.`,
);
