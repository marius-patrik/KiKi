// jscpd:ignore-start -- shared release-tooling boilerplate (module header), intentionally mirrored across scripts/*.mjs
/**
 * Fails when a canonical plugin/extension package is excluded from the
 * generated bundle as non-cordis without an explicit, justified allow-list
 * entry.
 *
 * The bundle generator (`generate-stack-bundle-patch.mjs`) silently drops
 * pack dependencies that have no cordis loader shape, and `bun run build` prints
 * the exclusion only as a log line nobody gates on. That is exactly how
 * `@dsh-stack/workspace-tabs` (typed tab reducer, tests, its own package) sat
 * in the tree for releases while the live UI ran a different implementation
 * inside `src/packages/providers/client.js`: the pack manifest depended on it,
 * typecheck and build stayed green, and nothing failed because the exclusion
 * was invisible to every verifier. This gate turns that log line into a
 * decision: a package may be excluded from the running bundle only if a
 * reviewed allow-list entry here states why.
 *
 * The gate delegates the mount/skip computation to the generator itself
 * (`list` mode) rather than re-deriving the loader-shape probe, so the two
 * cannot drift apart. It requires every package's `lib/` to already be built
 * (`bun run build` upstream), the same precondition the generator's `write` and
 * `check` modes document -- an unbuilt tree produces false exclusions, which
 * fail loud here rather than pass silently.
 *
 * @module @dsh-stack/scripts/verify-non-cordis-exclusions
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveRepoRoot } from "./lib/resolve-repo-root.mjs";

const root = resolveRepoRoot(import.meta.url);
const run = promisify(execFile);
// jscpd:ignore-end

/**
 * Packages the bundle generator may exclude as non-cordis, each with the
 * justification for its exclusion. An entry here is a deliberate, reviewed
 * decision -- not a way to silence the gate. Anything added without a real
 * reason recreates the `@dsh-stack/workspace-tabs` failure this gate exists
 * to prevent. An entry must be removed as soon as its package is deleted or
 * fixed; a stale entry fails this check.
 *
 * Two reviewed exclusion reasons exist today:
 *
 * - known cordis mount incompatibility: the package has a host entry but
 *   mounting it aborts or dead-ends the boot, as documented in
 *   KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs).
 * - client-only extension: the package reaches the running system as an
 *   extension composed into packs (so `verify-package-reachability.mjs`
 *   passes it) but carries no cordis host entry exporting `apply`, so there
 *   is nothing to mount as a bundle row.
 *
 * The remaining entries are pre-existing dead packages tracked for resolution
 * by #123; each must either gain a real owner or be deleted.
 */
const ALLOWED_NON_CORDIS_EXCLUSIONS = new Map([
  [
    "@dsh-stack/agent-commands",
    "known cordis mount incompatibility: injects unregistered host service `slots`, see KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs)",
  ],
  [
    "@dsh-stack/agent-personas",
    "known cordis mount incompatibility: injects unregistered host service `slots`, see KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs)",
  ],
  [
    "@dsh-stack/agent-skills",
    "known cordis mount incompatibility: duplicate SkillRegistry service key, see KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES (generate-stack-bundle-patch.mjs)",
  ],
  [
    "@dsh-stack/agent-preset-coding",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  [
    "@dsh-stack/agent-preset-default",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  [
    "@dsh-stack/agent-preset-manager",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  [
    "@dsh-stack/lucide-animated",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  [
    "@dsh-stack/profile-runtime",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  ["@dsh-stack/skin-claude", "client-only extension (composed into packs, no cordis host entry)"],
  ["@dsh-stack/skin-codex", "client-only extension (composed into packs, no cordis host entry)"],
  ["@dsh-stack/skin-deepseek", "client-only extension (composed into packs, no cordis host entry)"],
  [
    "@dsh-stack/trading-backtest",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  [
    "@dsh-stack/trading-research",
    "client-only extension (composed into packs, no cordis host entry)",
  ],
  ["@dsh-stack/tui", "client-only extension (composed into packs, no cordis host entry)"],
  ["@dsh-stack/composition", "pre-existing dead plugin, tracked by #123"],
  ["@dsh-stack/workspace-files", "pre-existing dead plugin, tracked by #123"],
  ["@dsh-stack/trading-market-data", "pre-existing dead plugin, tracked by #123"],
  ["@dsh-stack/trading-optimizer", "pre-existing dead plugin, tracked by #123"],
]);

/**
 * Extracts the package name from one generator `skipped` entry, which is
 * either a bare name or `name (known cordis mount incompatibility, ...)`.
 *
 * @param {string} skippedEntry - One entry of the generator's `skipped` list.
 * @returns {string} The excluded package name.
 */
function excludedPackageName(skippedEntry) {
  return skippedEntry.replace(/\s*\(.*\)$/, "").trim();
}

const { stdout } = await run(
  "node",
  [join("src", "scripts", "generate-stack-bundle-patch.mjs"), "list"],
  { cwd: root },
);
const { skipped } = JSON.parse(stdout);
const excluded = [...new Set(skipped.map(excludedPackageName))];

const unlisted = excluded.filter((name) => !ALLOWED_NON_CORDIS_EXCLUSIONS.has(name));
const stale = [...ALLOWED_NON_CORDIS_EXCLUSIONS.keys()].filter((name) => !excluded.includes(name));

if (unlisted.length > 0 || stale.length > 0) {
  for (const name of unlisted) {
    console.error(
      `Package excluded from the bundle as non-cordis without a justified ` +
        `allow-list entry: ${name}. ` +
        "Either give it a cordis loader shape (built host entry exporting `apply`) so it mounts, " +
        "or delete it if it is dead, or add a reviewed entry with a reason to " +
        "ALLOWED_NON_CORDIS_EXCLUSIONS (verify-non-cordis-exclusions.mjs).",
    );
  }
  for (const name of stale) {
    console.error(
      `Stale allow-list entry: ${name} is no longer excluded from the bundle. ` +
        "Remove the entry; a justified exclusion exists only while the exclusion does.",
    );
  }
  process.exit(1);
}

console.log(
  `Non-cordis exclusions verified: ${excluded.length} excluded package(s), all ` +
    "carrying a justified allow-list entry.",
);
