/**
 * Normal DSH profile provisioning for KiKi.
 *
 * First-level plugin folders are organizational groups only. Runtime profile
 * composition is expressed directly in each DSH profile's cordis.patch.yml;
 * KiKi does not inject an aggregate @dsh-stack/bundle package.
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

export interface ProfileCompositionOptions {
  home: string;
  pkgDir: string;
  profile: string;
  harnessDir?: string | null;
}

const RETIRED_WORKSPACE_MANIFESTS = ["pnpm-workspace.yaml"];
const LEGACY_STACK_BUNDLES = new Set([
  "@dsh-stack/pack-bundle",
  "@dsh-stack/pack-bundle-headless",
  "@dsh-stack/bundle",
  "@dsh-stack/bundle-headless",
]);
const PLUGIN_GROUPS = ["agents", "ai", "core", "integrations", "trading", "ux", "vcs"] as const;
const WEB_PROFILE_PLUGINS = [
  "@dsh-stack/agent-actions",
  "@dsh-stack/agent-loops",
  "@dsh-stack/agent-tools",
  "@dsh-stack/agents",
  "@dsh-stack/credential-vault",
  "@dsh-stack/dialect-antigravity",
  "@dsh-stack/dialect-claude",
  "@dsh-stack/dialect-code-assist",
  "@dsh-stack/dialect-openai",
  "@dsh-stack/dialects",
  "@dsh-stack/directory-picker-fix",
  "@dsh-stack/formatters",
  "@dsh-stack/hosts",
  "@dsh-stack/icon-engine",
  "@dsh-stack/lsp",
  "@dsh-stack/marketplace",
  "@dsh-stack/marketplace-source-dsh-stack",
  "@dsh-stack/profile-ui",
  "@dsh-stack/provider-anthropic-api",
  "@dsh-stack/provider-antigravity-sub",
  "@dsh-stack/provider-cerebras-api",
  "@dsh-stack/provider-claude-sub",
  "@dsh-stack/provider-deepseek-api",
  "@dsh-stack/provider-gemini-api",
  "@dsh-stack/provider-gemini-sub",
  "@dsh-stack/provider-grok-api",
  "@dsh-stack/provider-grok-sub",
  "@dsh-stack/provider-groq-api",
  "@dsh-stack/provider-kimi-code",
  "@dsh-stack/provider-kimi-sub",
  "@dsh-stack/provider-llamacpp",
  "@dsh-stack/provider-mistral-api",
  "@dsh-stack/provider-ollama",
  "@dsh-stack/provider-openai-api",
  "@dsh-stack/provider-openrouter-api",
  "@dsh-stack/provider-rotation",
  "@dsh-stack/provider-vllm",
  "@dsh-stack/provider-zai-api",
  "@dsh-stack/provider-zen",
  "@dsh-stack/providers",
  "@dsh-stack/repos",
  "@dsh-stack/sidebar-preferences",
  "@dsh-stack/sidebar-settings",
  "@dsh-stack/sidebar-shell",
  "@dsh-stack/skin-host",
  "@dsh-stack/skin-runtime",
  "@dsh-stack/skin-settings",
  "@dsh-stack/themes",
  "@dsh-stack/translator",
  "@dsh-stack/tweak-drag-drop",
  "@dsh-stack/tweak-fork-undo",
  "@dsh-stack/tweak-keybinds",
  "@dsh-stack/tweak-plan-toggle",
  "@dsh-stack/tweak-share-links",
  "@dsh-stack/tweak-slash-commands",
  "@dsh-stack/tweak-stats",
  "@dsh-stack/tweaks",
  "@dsh-stack/voice",
] as const;
const HEADLESS_PROFILE_PLUGINS = [
  "@dsh-stack/agent-loops",
  "@dsh-stack/agent-tools",
  "@dsh-stack/agents",
  "@dsh-stack/credential-vault",
  "@dsh-stack/dialect-antigravity",
  "@dsh-stack/dialect-claude",
  "@dsh-stack/dialect-code-assist",
  "@dsh-stack/dialect-openai",
  "@dsh-stack/dialects",
  "@dsh-stack/formatters",
  "@dsh-stack/icon-engine",
  "@dsh-stack/lsp",
  "@dsh-stack/marketplace",
  "@dsh-stack/marketplace-source-dsh-stack",
  "@dsh-stack/profile-ui",
  "@dsh-stack/provider-anthropic-api",
  "@dsh-stack/provider-antigravity-sub",
  "@dsh-stack/provider-cerebras-api",
  "@dsh-stack/provider-claude-sub",
  "@dsh-stack/provider-deepseek-api",
  "@dsh-stack/provider-gemini-api",
  "@dsh-stack/provider-gemini-sub",
  "@dsh-stack/provider-grok-api",
  "@dsh-stack/provider-grok-sub",
  "@dsh-stack/provider-groq-api",
  "@dsh-stack/provider-kimi-code",
  "@dsh-stack/provider-kimi-sub",
  "@dsh-stack/provider-llamacpp",
  "@dsh-stack/provider-mistral-api",
  "@dsh-stack/provider-ollama",
  "@dsh-stack/provider-openai-api",
  "@dsh-stack/provider-openrouter-api",
  "@dsh-stack/provider-rotation",
  "@dsh-stack/provider-vllm",
  "@dsh-stack/provider-zai-api",
  "@dsh-stack/provider-zen",
  "@dsh-stack/providers",
  "@dsh-stack/repos",
  "@dsh-stack/sidebar-preferences",
  "@dsh-stack/sidebar-settings",
  "@dsh-stack/sidebar-shell",
  "@dsh-stack/skin-host",
  "@dsh-stack/skin-runtime",
  "@dsh-stack/skin-settings",
  "@dsh-stack/themes",
  "@dsh-stack/translator",
  "@dsh-stack/tweak-drag-drop",
  "@dsh-stack/tweak-fork-undo",
  "@dsh-stack/tweak-keybinds",
  "@dsh-stack/tweak-plan-toggle",
  "@dsh-stack/tweak-share-links",
  "@dsh-stack/tweak-slash-commands",
  "@dsh-stack/tweak-stats",
  "@dsh-stack/tweaks",
] as const;
const PROFILE_PATCH_FILENAME = "cordis.patch.yml";
const REPLACED_SHELL_ROWS = ["ui-sidebar", "ui-settings-general"] as const;

/** Read the bundle list shipped by DSH for one profile. */
async function shippedProfileBundles(
  harnessDir: string | null,
  profile: string,
): Promise<string[] | null> {
  if (harnessDir === null) return null;
  try {
    const require = createRequire(join(harnessDir, "apps", "cli", "package.json"));
    const mod = (await import(
      pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
    )) as { PROFILE_TEMPLATES?: Record<string, { bundles?: string[] }> };
    const bundles = mod.PROFILE_TEMPLATES?.[profile]?.bundles;
    return Array.isArray(bundles) ? [...bundles] : null;
  } catch {
    return null;
  }
}

/** Read a JSON document, returning null when it cannot be parsed. */
function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Reconcile a profile manifest with DSH defaults and remove retired KiKi bundle declarations. */
async function ensureProfileManifest(
  profileDir: string,
  profile: string,
  harnessDir: string | null,
): Promise<void> {
  const path = join(profileDir, "package.json");
  const shipped = await shippedProfileBundles(harnessDir, profile);
  const existing = readJson(path);
  if (existing === null && shipped === null) {
    throw new Error(
      `dsh: cannot read the shipped '${profile}' profile template from the harness at ` +
        `${harnessDir ?? "(no harness checkout found)"}; refusing to provision a profile ` +
        "without its normal DSH base composition. Build the harness " +
        "(./scripts/bootstrap install build) and try again.",
    );
  }

  const doc: Record<string, unknown> = existing ?? {
    name: `dsh-profile-${profile}`,
    version: "0.1.0",
    type: "module",
    dependencies: {},
    dsh: { profile: { bundles: [...(shipped ?? [])] } },
  };

  const dependencies = { ...((doc.dependencies as Record<string, string> | undefined) ?? {}) };
  for (const legacy of LEGACY_STACK_BUNDLES) delete dependencies[legacy];
  doc.dependencies = dependencies;

  const dsh = { ...((doc.dsh as Record<string, unknown> | undefined) ?? {}) };
  const profileCfg = { ...((dsh.profile as Record<string, unknown> | undefined) ?? {}) };
  const declared = Array.isArray(profileCfg.bundles) ? (profileCfg.bundles as unknown[]) : [];
  const bundles: string[] = [];
  for (const item of [...(shipped ?? []), ...declared]) {
    if (typeof item !== "string" || LEGACY_STACK_BUNDLES.has(item) || bundles.includes(item))
      continue;
    bundles.push(item);
  }
  profileCfg.bundles = bundles;
  dsh.profile = profileCfg;
  doc.dsh = dsh;
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

/** Return whether a symlink resolves exactly to the expected package directory. */
function linksTo(linkTarget: string, expected: string): boolean {
  try {
    if (!lstatSync(linkTarget).isSymbolicLink()) return false;
    if (!isAbsolute(readlinkSync(linkTarget))) return false;
    return realpathSync(readlinkSync(linkTarget)) === realpathSync(expected);
  } catch {
    return false;
  }
}

/** Remove an existing file, directory, or symlink before recreating a profile package link. */
function clearOccupant(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) unlinkSync(path);
    else rmSync(path, { recursive: true, force: true });
  } catch {
    // Nothing to clear.
  }
}

/** Discover native KiKi packages across the logical plugin groups. */
function discoverStackPackages(repoRoot: string): Array<{ name: string; dir: string }> {
  const pluginsRoot = join(repoRoot, "plugins");
  const packages: Array<{ name: string; dir: string }> = [];
  for (const group of PLUGIN_GROUPS) {
    const groupDir = join(pluginsRoot, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir)) {
      const dir = join(groupDir, entry);
      const manifest = readJson(join(dir, "package.json"));
      const name = manifest?.name;
      if (typeof name === "string" && name.startsWith("@dsh-stack/")) packages.push({ name, dir });
    }
  }
  return packages;
}

/** Link every native KiKi package into a profile-local @dsh-stack scope. */
function ensureStackSymlinks(profileDir: string, pkgDir: string): Set<string> {
  const repoRoot = join(pkgDir, "..", "..", "..");
  const scopeDir = join(profileDir, "node_modules", "@dsh-stack");
  mkdirSync(scopeDir, { recursive: true });
  const shipped = new Set<string>();

  for (const pkg of discoverStackPackages(repoRoot)) {
    shipped.add(pkg.name);
    const target = join(scopeDir, pkg.name.slice("@dsh-stack/".length));
    if (linksTo(target, pkg.dir)) continue;
    clearOccupant(target);
    try {
      symlinkSync(pkg.dir, target, "dir");
    } catch {
      // A concurrent provisioning pass may have won the path.
    }
  }
  return shipped;
}

/** Remove stale profile-local links for packages no longer shipped by KiKi. */
function removeRetiredPackageLinks(profileDir: string, shipped: Set<string>): void {
  const scopeDir = join(profileDir, "node_modules", "@dsh-stack");
  let entries: string[] = [];
  try {
    entries = readdirSync(scopeDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (shipped.has(`@dsh-stack/${entry}`)) continue;
    const path = join(scopeDir, entry);
    try {
      if (lstatSync(path).isSymbolicLink()) unlinkSync(path);
    } catch {
      // Nothing to remove.
    }
  }
}

/** Remove package-manager workspace manifests that do not belong inside a DSH profile. */
function removeRetiredWorkspaceManifests(profileDir: string): void {
  for (const manifest of RETIRED_WORKSPACE_MANIFESTS) {
    rmSync(join(profileDir, manifest), { force: true });
  }
}

/** Return the KiKi plugin rows mounted directly by a named DSH profile. */
function profilePlugins(profile: string): readonly string[] {
  return profile === "headless" ? HEADLESS_PROFILE_PLUGINS : WEB_PROFILE_PLUGINS;
}

/** Reconcile KiKi's direct plugin rows and required shell disables in a profile patch. */
function ensureProfilePatch(profileDir: string, profile: string): void {
  const patchPath = join(profileDir, PROFILE_PATCH_FILENAME);
  let entries: Record<string, unknown>[] = [];
  if (existsSync(patchPath)) {
    try {
      const parsed = YAML.parse(readFileSync(patchPath, "utf8")) as unknown;
      if (Array.isArray(parsed)) entries = parsed as Record<string, unknown>[];
    } catch {
      return;
    }
  }

  if (profile === "web") {
    for (const row of ["directory-picker", ...REPLACED_SHELL_ROWS]) {
      const existing = entries.find((entry) => entry?.id === row);
      if (existing === undefined) entries.push({ id: row, disabled: true });
      else if (existing.disabled === undefined) existing.disabled = true;
    }
  }

  let insert = entries.find((entry) => Array.isArray(entry?.insert));
  if (insert === undefined) {
    insert = { insert: [] };
    entries.push(insert);
  }
  const rows = insert.insert as Record<string, unknown>[];
  const mounted = new Set(
    rows.map((row) => (typeof row?.name === "string" ? row.name : null)).filter(Boolean),
  );
  for (const name of profilePlugins(profile)) {
    if (mounted.has(name)) continue;
    rows.push({ id: name.slice("@dsh-stack/".length), name });
  }

  writeFileSync(patchPath, YAML.stringify(entries), "utf8");
}

/** Reconcile one DSH profile for a local KiKi checkout without introducing an aggregate runtime bundle. */
export async function ensureProfileComposition(options: ProfileCompositionOptions): Promise<void> {
  const { home, pkgDir, profile, harnessDir } = options;
  const profileDir = join(home, "profiles", profile);
  mkdirSync(profileDir, { recursive: true });
  await ensureProfileManifest(profileDir, profile, harnessDir ?? null);
  ensureProfilePatch(profileDir, profile);
  removeRetiredWorkspaceManifests(profileDir);
  removeRetiredPackageLinks(profileDir, ensureStackSymlinks(profileDir, pkgDir));
}
