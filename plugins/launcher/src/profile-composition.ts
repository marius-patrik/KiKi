/**
 * Profile composition provisioning for dsh profiles in DSH_HOME.
 * Ensures a profile directory declares its Stack bundle in both `dependencies` and
 * `dsh.profile.bundles`, carries local `@dsh-stack/*` symlinks under its own
 * `node_modules`, and carries no workspace manifest from a retired package manager.
 * Every step is idempotent and re-runnable at each start.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";

/**
 * Inputs identifying one profile to provision.
 */
export interface ProfileCompositionOptions {
  /** The DSH_HOME root path. */
  home: string;
  /** Root directory of the @dsh-stack/launcher package. */
  pkgDir: string;
  /** Profile directory name under `profiles/`. */
  profile: string;
  /** Pack bundle the profile composes, e.g. `@dsh-stack/bundle`. */
  bundle: string;
  /** Harness checkout supplying the shipped profile template; omit in tests. */
  harnessDir?: string | null;
}

/**
 * Bundle names a profile may still carry from before the pack vocabulary was
 * dropped, mapped to their current names.
 */
const LEGACY_PROFILE_BUNDLES: Record<string, string> = {
  "@dsh-stack/pack-bundle": "@dsh-stack/bundle",
  "@dsh-stack/pack-bundle-headless": "@dsh-stack/bundle-headless",
};

/** Bundle the default `web` profile composes. */
export const WEB_PROFILE_BUNDLE = "@dsh-stack/bundle";

/** Pack bundle the `headless` profile composes. */
export const HEADLESS_PROFILE_BUNDLE = "@dsh-stack/bundle-headless";

/**
 * Workspace manifests left behind by a retired package manager.
 *
 * The Stack workspace moved from pnpm to bun. A profile directory still carrying
 * `pnpm-workspace.yaml` makes the resolver read the pnpm layout instead of the bun
 * one, so the bundle's dependency closure is never linked.
 */
const RETIRED_WORKSPACE_MANIFESTS = ["pnpm-workspace.yaml"];

/**
 * Directory trees holding canonical Stack packages, in resolution order.
 *
 * @param repoRoot - the Stack repository root.
 * @returns absolute package directories to link.
 */
function packageSourceDirs(repoRoot: string): string[] {
  return [join(repoRoot, "plugins"), join(repoRoot, "bundles")];
}

/**
 * Reads a package.json, falling back to a fresh document when absent or unparseable.
 *
 * @param path - the package.json path.
 * @param fallback - document to use when the file cannot supply one.
 * @returns the parsed document.
 */
function readPackageJsonOr(
  path: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

/**
 * Ensure the profile's package.json declares the bundle in both the install-time
 * `dependencies` map and the loader-time `dsh.profile.bundles` list.
 *
 * Both entries are required and neither implies the other: `dependencies` is what
 * the package manager resolves into `node_modules`, `dsh.profile.bundles` is what
 * the harness Loader composes at boot.
 *
 * @param profileDir - the profile directory.
 * @param bundle - pack bundle name to declare.
 */
/**
 * Read the bundle list the harness ships for `profile`.
 *
 * A provisioned profile must declare the same base and application rows a person
 * would get from `dsh plugin --profile <name> init --from-default-profile <name>`.
 * Seeding only the Stack bundle produces a profile whose core services
 * (`commands`, `tools`, `fs`, `llm`, `settings`) and web application row never
 * mount: the Stack entries that inject them stay pending, nothing binds the
 * configured port, and the profile process then exits immediately because no
 * mounted plugin holds the event loop open. The harness owns these templates, so
 * they are read from it rather than restated here.
 *
 * @param harnessDir - the harness checkout, or null when it cannot be located.
 * @param profile - the profile name.
 * @returns the shipped bundles, or null when the template cannot be read.
 */
async function shippedProfileBundles(
  harnessDir: string | null,
  profile: string,
): Promise<string[] | null> {
  if (harnessDir === null) return null;
  try {
    const require = createRequire(join(harnessDir, "apps", "cli", "package.json"));
    const mod = (await import(
      pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
    )) as {
      PROFILE_TEMPLATES?: Record<string, { bundles?: string[] }>;
    };
    const bundles = mod.PROFILE_TEMPLATES?.[profile]?.bundles;
    return Array.isArray(bundles) ? [...bundles] : null;
  } catch {
    return null;
  }
}

/**
 * Declare `bundle` in the profile manifest, creating the manifest when missing and
 * restoring any shipped rows an earlier manifest left out.
 *
 * Reconciliation runs on every pass, not only for a new manifest: a profile
 * provisioned by an earlier launcher carries just the Stack bundle, and the Stack
 * cannot activate without the base and application rows underneath it. Re-adding
 * them is additive, so a person's own bundle choices are preserved.
 *
 * @param profileDir - the profile directory.
 * @param bundle - pack bundle name to declare.
 * @param profile - the profile name, used to seed a created manifest.
 * @param harnessDir - the harness checkout supplying the shipped template.
 */
async function ensureBundleDeclaration(
  profileDir: string,
  bundle: string,
  profile: string,
  harnessDir: string | null,
): Promise<void> {
  const pkgJsonPath = join(profileDir, "package.json");
  const shipped = await shippedProfileBundles(harnessDir, profile);
  if (shipped === null && !existsSync(pkgJsonPath)) {
    // Seeding only the Stack bundle produces a profile that mounts, serves nothing,
    // and exits 0. Refusing is the difference between a diagnosable failure and the
    // silent one this replaces.
    throw new Error(
      `dsh: cannot read the shipped '${profile}' profile template from the harness at ` +
        `${harnessDir ?? "(no harness checkout found)"}; refusing to provision a profile with ` +
        "only the Stack bundle, because it would mount, serve nothing, and exit 0. " +
        "Build the harness (./scripts/bootstrap install build) and try again.",
    );
  }
  const pkgData = readPackageJsonOr(pkgJsonPath, {
    name: `dsh-profile-${profile}`,
    version: "0.1.0",
    type: "module",
    dependencies: {},
    dsh: { profile: { bundles: [...(shipped ?? [])] } },
  });

  const deps = { ...(pkgData.dependencies as Record<string, string> | undefined) };
  deps[bundle] = deps[bundle] ?? "^0.1.0";
  pkgData.dependencies = deps;

  const dsh = { ...(pkgData.dsh as Record<string, unknown> | undefined) };
  const profileCfg = { ...(dsh.profile as Record<string, unknown> | undefined) };
  // A profile provisioned before the pack vocabulary was dropped declares the
  // bundle under its old name. Renaming it here is what upgrades an existing
  // machine: leaving it would put the new bundle beside the stale one and boot
  // two bundle layers over the same rows.
  const declaredNow = (Array.isArray(profileCfg.bundles) ? profileCfg.bundles : []) as string[];
  const existing: string[] = [];
  for (const name of declaredNow) {
    const replacement = LEGACY_PROFILE_BUNDLES[name];
    if (replacement === undefined) {
      existing.push(name);
      continue;
    }
    if (!declaredNow.includes(replacement) && !existing.includes(replacement)) {
      existing.push(replacement);
    }
  }
  // Template order first: the base row has to mount before the application row that
  // injects into it. Prepending each missing shipped bundle instead would reverse it.
  const bundles = [...(shipped ?? [])];
  for (const declared of existing) {
    if (declared === bundle) continue;
    if (!bundles.includes(declared)) bundles.push(declared);
  }
  if (!bundles.includes(bundle)) bundles.push(bundle);
  profileCfg.bundles = bundles;
  dsh.profile = profileCfg;
  pkgData.dsh = dsh;

  writeFileSync(pkgJsonPath, `${JSON.stringify(pkgData, null, 2)}\n`, "utf8");
}

/**
 * Whether `linkTarget` already resolves to the directory it should.
 *
 * A symlink is only acceptable when it is absolute and still resolves: a relative
 * target is interpreted against the link's own directory, and a stale one points
 * at a package that has moved or been deleted. Either way the Loader then fails to
 * resolve the bundle, and the failure surfaces as "cannot resolve profile bundle"
 * rather than as anything pointing at the link.
 *
 * @param linkTarget - the path the link occupies.
 * @param expected - the directory the link must resolve to.
 * @returns true when the path is already a symlink resolving to `expected`.
 */
function linksTo(linkTarget: string, expected: string): boolean {
  try {
    if (!lstatSync(linkTarget).isSymbolicLink()) return false;
    if (!isAbsolute(readlinkSync(linkTarget))) return false;
    // realpathSync throws ENOENT on a link whose target does not exist, which is
    // precisely the case this function exists to reject -- moving the tree leaves
    // every profile link pointing at its old location. Resolving the *target*
    // rather than the link compares the two paths without dereferencing the link,
    // so a dangling link answers "not acceptable" instead of throwing and aborting
    // provisioning with an error that names the link rather than the cause.
    return realpathSync(readlinkSync(linkTarget)) === realpathSync(expected);
  } catch {
    return false;
  }
}

/**
 * Shell rows the Stack's client bundle re-declares for itself.
 *
 * `sidebar` and `sidebar.settings` moved to dsh-tweaks' client bundle under a
 * one-declarer-per-slot rule, so the harness' own shells have to be disabled or
 * the client tree refuses to boot both of them. Every other surface
 * (ui-workspace and the settings features) stays enabled and re-attaches through
 * the slots dsh-tweaks re-declares.
 */
const REPLACED_SHELL_ROWS = ["ui-sidebar", "ui-settings-general"] as const;

/** Patch filename in a profile directory. */
const PROFILE_PATCH_FILENAME = "cordis.patch.yml";

/**
 * Ensure the profile's patch layer disables the harness shells the Stack replaces.
 *
 * A profile provisioned without this layer still serves HTTP 200 and reports every
 * entry active on the server, but the browser then fails the whole client tree:
 * `dsh-client-ui-sidebar` and `@dsh-stack/tweaks` both declare the same slot, and
 * the client refuses to boot either. So this cannot be left to whoever created the
 * profile — an existing one is repaired too, since a profile written before the
 * slots moved carries the same latent conflict.
 *
 * Only the disables are added. The rest of a person's patch layer, and any explicit
 * `disabled` they set on those rows themselves, is left as written.
 *
 * @param profileDir - the profile directory.
 */
function ensureStackPatchLayer(profileDir: string): void {
  const patchPath = join(profileDir, PROFILE_PATCH_FILENAME);
  let entries: Record<string, unknown>[] = [];
  if (existsSync(patchPath)) {
    try {
      const parsed = YAML.parse(readFileSync(patchPath, "utf8")) as unknown;
      if (Array.isArray(parsed)) entries = parsed as Record<string, unknown>[];
    } catch {
      // An unparseable patch layer is a person's file to fix; leave it untouched.
      return;
    }
  }
  const declared = new Set(entries.map((entry) => entry?.id));
  const missing = REPLACED_SHELL_ROWS.filter(
    (row) =>
      !declared.has(row) || entries.find((entry) => entry?.id === row)?.disabled === undefined,
  );
  if (missing.length === 0) return;
  for (const row of missing) {
    entries.push({ id: row, disabled: true });
  }
  writeFileSync(patchPath, YAML.stringify(entries), "utf8");
}

/**
 * Remove whatever occupies `path` so a link can be created in its place.
 *
 * A symlink is unlinked rather than removed recursively: `rmSync` with
 * `recursive: true` reports a dangling symlink gone through `existsSync` while
 * leaving its directory entry in place, so the following `symlinkSync` fails with
 * `EEXIST`. That divergence is node-specific and the launcher runs under node.
 *
 * @param path - the path to clear.
 */
function clearOccupant(path: string): void {
  let isLink = false;
  try {
    isLink = lstatSync(path).isSymbolicLink();
  } catch {
    return;
  }
  if (isLink) {
    try {
      unlinkSync(path);
    } catch {
      // A concurrent provisioning pass won the path.
    }
    return;
  }
  rmSync(path, { recursive: true, force: true });
}

/**
 * Link every canonical Stack package into the profile's own `node_modules/@dsh-stack`
 * so the harness Loader resolves `@dsh-stack/*` from the monorepo checkout.
 *
 * Linking is per-package and idempotent: a link that already resolves to the
 * package is left alone, and anything else occupying the path — a stale or
 * relative symlink, or a directory left by an older layout — is replaced.
 *
 * @param profileDir - the profile directory.
 * @param pkgDir - the launcher package directory, used to derive the repository root.
 */
function ensureStackSymlinks(profileDir: string, pkgDir: string): Set<string> {
  const repoRoot = join(pkgDir, "..", "..");
  const scopeDir = join(profileDir, "node_modules", "@dsh-stack");
  mkdirSync(scopeDir, { recursive: true });

  const shipped = new Set<string>();
  for (const sourceDir of packageSourceDirs(repoRoot)) {
    if (!existsSync(sourceDir)) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(sourceDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = join(sourceDir, entry);
      const manifestPath = join(entryPath, "package.json");
      if (!existsSync(manifestPath)) continue;
      let pkgName: unknown;
      try {
        pkgName = (JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: unknown }).name;
      } catch {
        continue;
      }
      if (typeof pkgName !== "string" || !pkgName.startsWith("@dsh-stack/")) continue;

      const linkTarget = join(scopeDir, pkgName.slice("@dsh-stack/".length));
      shipped.add(pkgName);
      if (linksTo(linkTarget, entryPath)) continue;
      clearOccupant(linkTarget);
      try {
        symlinkSync(entryPath, linkTarget, "dir");
      } catch {
        // A concurrent provisioning pass won the path.
      }
    }
  }  return shipped;

}

/**
 * Delete workspace manifests from a retired package manager.
 *
 * @param profileDir - the profile directory.
 */
function removeRetiredWorkspaceManifests(profileDir: string): void {
  for (const manifest of RETIRED_WORKSPACE_MANIFESTS) {
    rmSync(join(profileDir, manifest), { force: true });
  }
}

/**
 * Remove links in the profile's `@dsh-stack` scope that name a package the
 * repository no longer ships.
 *
 * Provisioning otherwise only ever adds or repairs links, so a package deleted
 * from the tree leaves its link behind forever: dangling, unresolvable, and named
 * in the profile's dependency surface. Retiring the pack compositions in #308
 * left exactly that on every existing profile.
 *
 * A link is only removed when its own name is absent from the current tree, so
 * this cannot delete a link that is merely mis-targeted -- that case belongs to
 * the repair path, which knows the correct target.
 *
 * @param profileDir - the profile directory.
 * @param shipped - every `@dsh-stack/*` name the current tree provides.
 */
function removeRetiredPackageLinks(profileDir: string, shipped: Set<string>): void {
  const scopeDir = join(profileDir, "node_modules", "@dsh-stack");
  let entries: string[] = [];
  try {
    entries = readdirSync(scopeDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = `@dsh-stack/${entry}`;
    if (shipped.has(name)) continue;
    const link = join(scopeDir, entry);
    try {
      // unlink, not rmSync: a dangling symlink is exactly the case here, and
      // rmSync leaves it on disk -- as does rmSync with recursive, which reports
      // the path gone through existsSync while the directory entry survives.
      if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
    } catch {
      // Nothing to remove.
    }
  }
}

/**
 * Provision one profile's Stack composition: the bundle declaration, the package
 * symlinks it resolves through, and the absence of a retired workspace manifest.
 *
 * Provisioning is a boot-time concern, not a manual setup step: a profile created or
 * restored from backup is repaired on the next start rather than by hand.
 *
 * @param options - the profile identity and its pack bundle.
 */
export async function ensureProfileComposition(options: ProfileCompositionOptions): Promise<void> {
  const { home, pkgDir, profile, bundle, harnessDir } = options;
  const profileDir = join(home, "profiles", profile);
  mkdirSync(profileDir, { recursive: true });
  await ensureBundleDeclaration(profileDir, bundle, profile, harnessDir ?? null);
  ensureStackPatchLayer(profileDir);
  removeRetiredWorkspaceManifests(profileDir);
  removeRetiredPackageLinks(profileDir, ensureStackSymlinks(profileDir, pkgDir));
}
