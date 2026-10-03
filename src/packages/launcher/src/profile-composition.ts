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
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

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
  /** Pack bundle the profile composes, e.g. `@dsh-stack/pack-bundle`. */
  bundle: string;
}

/** Pack bundle the default `web` profile composes. */
export const WEB_PROFILE_BUNDLE = "@dsh-stack/pack-bundle";

/** Pack bundle the `headless` profile composes. */
export const HEADLESS_PROFILE_BUNDLE = "@dsh-stack/pack-bundle-headless";

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
  return [
    join(repoRoot, "publish", "packs"),
    join(repoRoot, "publish", "extensions"),
    join(repoRoot, "src", "packages"),
  ];
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
function ensureBundleDeclaration(profileDir: string, bundle: string): void {
  const pkgJsonPath = join(profileDir, "package.json");
  const pkgData = readPackageJsonOr(pkgJsonPath, {
    name: `dsh-profile-${profileDir.split("/").pop() ?? "profile"}`,
    version: "0.1.0",
    type: "module",
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  });

  const deps = { ...(pkgData.dependencies as Record<string, string> | undefined) };
  deps[bundle] = deps[bundle] ?? "^0.1.0";
  pkgData.dependencies = deps;

  const dsh = { ...(pkgData.dsh as Record<string, unknown> | undefined) };
  const profile = { ...(dsh.profile as Record<string, unknown> | undefined) };
  const bundles = Array.isArray(profile.bundles) ? [...(profile.bundles as string[])] : [];
  if (!bundles.includes(bundle)) bundles.push(bundle);
  profile.bundles = bundles;
  dsh.profile = profile;
  pkgData.dsh = dsh;

  writeFileSync(pkgJsonPath, `${JSON.stringify(pkgData, null, 2)}\n`, "utf8");
}

/**
 * Link every canonical Stack package into the profile's own `node_modules/@dsh-stack`
 * so the harness Loader resolves `@dsh-stack/*` from the monorepo checkout.
 *
 * Linking is per-package and non-destructive: an existing symlink is left alone and a
 * non-symlink occupant is replaced, because a stale directory shadows the checkout.
 *
 * @param profileDir - the profile directory.
 * @param pkgDir - the launcher package directory, used to derive the repository root.
 */
function ensureStackSymlinks(profileDir: string, pkgDir: string): void {
  const repoRoot = join(pkgDir, "..", "..", "..");
  const scopeDir = join(profileDir, "node_modules", "@dsh-stack");
  mkdirSync(scopeDir, { recursive: true });

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
      let linked = false;
      try {
        if (lstatSync(linkTarget).isSymbolicLink()) {
          linked = true;
        } else {
          rmSync(linkTarget, { recursive: true, force: true });
        }
      } catch {
        // Nothing occupies the path yet.
      }
      if (linked) continue;
      try {
        symlinkSync(entryPath, linkTarget, "dir");
      } catch {
        // A concurrent provisioning pass won the path.
      }
    }
  }
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
 * Provision one profile's Stack composition: the bundle declaration, the package
 * symlinks it resolves through, and the absence of a retired workspace manifest.
 *
 * Provisioning is a boot-time concern, not a manual setup step: a profile created or
 * restored from backup is repaired on the next start rather than by hand.
 *
 * @param options - the profile identity and its pack bundle.
 */
export function ensureProfileComposition(options: ProfileCompositionOptions): void {
  const { home, pkgDir, profile, bundle } = options;
  const profileDir = join(home, "profiles", profile);
  mkdirSync(profileDir, { recursive: true });
  ensureBundleDeclaration(profileDir, bundle);
  removeRetiredWorkspaceManifests(profileDir);
  ensureStackSymlinks(profileDir, pkgDir);
}
