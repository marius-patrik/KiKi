// jscpd:ignore-start -- shared release-tooling boilerplate (module header), intentionally mirrored across scripts/*.mjs
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const packagesDir = join(root, "plugins");
const extensionsDir = join(root, "plugins");
const packsDir = join(root, "publish/packs");
const pluginsDir = join(root, "plugins");
const command = process.argv[2];
const bumpArg = process.argv[3] ?? "patch";
const validBumps = new Set(["major", "minor", "patch"]);
if (!["manifest", "version", "assets"].includes(command)) {
  console.error("usage: node scripts/release.mjs <manifest|version|assets> [major|minor|patch]");
  process.exit(2);
}
if (command === "version" && !validBumps.has(bumpArg)) {
  console.error(`invalid version bump: ${bumpArg}`);
  process.exit(2);
}

/** Read and parse a UTF-8 JSON file. */
async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

/** Serialize a value as consistently formatted UTF-8 JSON. */
async function writeJson(path, value) {
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Execute a command and return trimmed stdout. */
async function exec(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, { cwd: root, ...options });
  return stdout.trim();
}

/** Calculate the next semantic version for the requested release bump. */
function bumpVersion(version, kind) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0))
    throw new Error(`invalid semver: ${version}`);
  if (kind === "major") return `${parts[0] + 1}.0.0`;
  if (kind === "minor") return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/** Discover package implementations from the canonical packages, extensions, and packs directories. */
async function discoverPackages() {
  const packages = [];
  for (const catalogDir of [packagesDir, extensionsDir, packsDir]) {
    let entries;
    try {
      entries = await fs.readdir(catalogDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const dir = join(catalogDir, entry.name);
      try {
        const [stack, pkg] = await Promise.all([
          readJson(join(dir, "stack.json")),
          readJson(join(dir, "package.json")),
        ]);
        if (!stack || typeof stack.id !== "string") continue;
        packages.push({ dir, stack, pkg });
      } catch {}
    }
  }
  packages.sort((a, b) => a.stack.id.localeCompare(b.stack.id));
  return packages;
}

/** Recursively discover plugin or pack directories containing a package manifest. */
async function discoverComponentDirectories(baseDir, relativePrefix = "") {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const components = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = join(baseDir, entry.name);
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    try {
      const pkg = await readJson(join(dir, "package.json"));
      components.push({ dir, relativePath, pkg });
      continue;
    } catch {}
    components.push(...(await discoverComponentDirectories(dir, relativePath)));
  }
  components.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return components;
}

/** Read pack/profile membership from the composition catalog. */
async function catalogMembership() {
  const source = await fs.readFile(join(packagesDir, "composition", "src", "catalog.ts"), "utf8");
  const packs = {};
  const profiles = {};
  let section = null;
  let current = null;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("export const packs")) {
      section = "packs";
      continue;
    }
    if (line.startsWith("export const profiles")) {
      section = "profiles";
      continue;
    }
    const objectMatch = line.match(/^id:\s*["']([^"']+)["']/);
    if (objectMatch) {
      current = objectMatch[1];
      if (section === "packs") packs[current] = [];
      else if (section === "profiles") profiles[current] = [];
      continue;
    }
    const quoted = line.match(/["']([^"']+)["']/g)?.map((value) => value.slice(1, -1)) ?? [];
    if (current !== null) {
      if (section === "packs")
        for (const id of quoted) if (id.startsWith("stack.")) packs[current].push(id);
      if (section === "profiles")
        for (const id of quoted) if (id.startsWith("stack.")) profiles[current].push(id);
    }
    if (line === "},") current = null;
  }
  return { packs, profiles };
}

/** Build the machine-readable release catalog from package and catalog metadata. */
async function buildManifest() {
  const rootPackage = await readJson(join(root, "package.json"));
  const packages = await discoverPackages();
  const byId = new Map(packages.map((item) => [item.stack.id, item]));
  const membership = await catalogMembership();
  const catalogPackages = packages.map(({ stack, pkg, dir }) => ({
    id: stack.id,
    name: stack.name,
    version: stack.version,
    kind: stack.kind,
    dependencies: (stack.dependencies ?? []).map((id) => ({
      id,
      version: byId.get(id)?.stack.version ?? null,
    })),
    optionalDependencies: (stack.optionalDependencies ?? []).map((id) => ({
      id,
      version: byId.get(id)?.stack.version ?? null,
    })),
    files: stack.files,
    packagePath: relative(root, dir),
    packagePrivate: pkg.private === true,
    packs: Object.entries(membership.packs)
      .filter(([, ids]) => ids.includes(stack.id))
      .map(([id]) => id),
    profiles: Object.entries(membership.profiles)
      .filter(([, ids]) => ids.includes(stack.id))
      .map(([id]) => id),
  }));
  return {
    format: 1,
    stack: { name: rootPackage.name, version: rootPackage.version },
    packages: catalogPackages,
    packs: membership.packs,
    profiles: membership.profiles,
  };
}

/** Generate the release catalog and its integrity checksum. */
async function manifest() {
  const value = await buildManifest();
  const outputDir = join(root, ".release");
  await fs.mkdir(outputDir, { recursive: true });
  const output = join(outputDir, "stack-release.json");
  await writeJson(output, value);
  const integrity = createHash("sha256")
    .update(await fs.readFile(output))
    .digest("hex");
  await fs.writeFile(
    join(outputDir, "stack-release.sha256"),
    `${integrity}  stack-release.json\n`,
    "utf8",
  );
  console.log(output);
}

/**
 * A plugin wrapper's own package.json has no version (it's a thin, private
 * composition shim); its real version is the canonical package/extension it
 * wraps, resolved by matching directory name.
 */
async function resolveComponentVersion(component, kind) {
  if (kind !== "plugin" || (component.pkg?.version ?? undefined) !== undefined) {
    return component.pkg?.version ?? "0.0.0";
  }
  for (const canonicalDir of [packagesDir, extensionsDir]) {
    try {
      const canonicalPkg = await readJson(
        join(canonicalDir, component.relativePath, "package.json"),
      );
      if (typeof canonicalPkg.version === "string") return canonicalPkg.version;
    } catch {}
  }
  return "0.0.0";
}

/** Create a ZIP archive containing one component with symlinks fully dereferenced. */
async function zipComponent(component, outputDir, kind, stageDir) {
  const slug = component.relativePath.replaceAll("/", "-");
  const version = await resolveComponentVersion(component, kind);
  const archive = join(outputDir, `${kind}-${slug}-${version}.zip`);
  const staged = join(stageDir, kind, slug);
  await fs.mkdir(join(stageDir, kind), { recursive: true });
  await fs.cp(component.dir, staged, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (source) => !relative(component.dir, source).split("/").includes("node_modules"),
  });
  await exec("zip", ["-qr", archive, "."], { cwd: staged });
  return archive;
}

/** Build individual ZIP assets for every plugin, extension and pack in the repository. */
async function componentArchives(outputDir) {
  const stageDir = join(outputDir, ".stage");
  await fs.rm(stageDir, { recursive: true, force: true });
  await fs.mkdir(stageDir, { recursive: true });

  const pluginComponents = await discoverComponentDirectories(pluginsDir);
  const extensionComponents = await discoverComponentDirectories(extensionsDir);
  const packComponents = await discoverComponentDirectories(packsDir);
  const archives = [];

  for (const component of pluginComponents) {
    if (component.relativePath === "packs" || component.relativePath.startsWith("packs/")) continue;
    archives.push(await zipComponent(component, outputDir, "plugin", stageDir));
  }
  for (const component of extensionComponents) {
    archives.push(await zipComponent(component, outputDir, "extension", stageDir));
  }
  for (const component of packComponents) {
    archives.push(await zipComponent(component, outputDir, "pack", stageDir));
  }

  await fs.rm(stageDir, { recursive: true, force: true });
  return archives;
}

/** Build individual plugin/pack ZIPs and the release integrity manifest. */
async function assets() {
  const rootPackage = await readJson(join(root, "package.json"));
  const outputDir = join(root, ".release");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await manifest();
  const archives = await componentArchives(outputDir);
  const assetInventory = {
    format: 1,
    plugins: archives
      .filter((file) => file.includes("/plugin-") || file.startsWith(join(outputDir, "plugin-")))
      .map((file) => relative(outputDir, file)),
    extensions: archives
      .filter(
        (file) => file.includes("/extension-") || file.startsWith(join(outputDir, "extension-")),
      )
      .map((file) => relative(outputDir, file)),
    packs: archives
      .filter((file) => file.includes("/pack-") || file.startsWith(join(outputDir, "pack-")))
      .map((file) => relative(outputDir, file)),
    total: archives.length,
  };
  await writeJson(join(outputDir, "component-assets.json"), assetInventory);
  const files = await fs.readdir(outputDir);
  const checksums = [];
  for (const file of files.sort()) {
    if (file.endsWith(".sha256")) continue;
    const digest = createHash("sha256")
      .update(await fs.readFile(join(outputDir, file)))
      .digest("hex");
    checksums.push(`${digest}  ${file}`);
  }
  await fs.writeFile(join(outputDir, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");
  console.log(`Generated ${archives.length} component ZIPs for ${rootPackage.version}`);
  console.log(files.map((file) => join(outputDir, file)).join("\n"));
}

/** Apply semantic versioning to the root package and packages changed by the latest commit. */
async function version() {
  const rootPackagePath = join(root, "package.json");
  const rootPackage = await readJson(rootPackagePath);
  const commitText = await exec("git", ["log", "--format=%s%n%b", "-n", "200"]);
  const rootBump = /BREAKING CHANGE|^[^\n]*!:/m.test(commitText)
    ? "major"
    : /^(feat)(\([^)]*\))?:/m.test(commitText)
      ? "minor"
      : bumpArg;
  rootPackage.version = bumpVersion(rootPackage.version, rootBump);
  await writeJson(rootPackagePath, rootPackage);

  const packages = await discoverPackages();
  for (const item of packages) {
    const relativeDir = relative(root, item.dir);
    const changed = await exec("git", ["diff", "--name-only", "HEAD^", "HEAD", "--", relativeDir]);
    if (!changed) continue;
    const messages = await exec("git", ["log", "--format=%s%n%b", "-n", "50", "--", relativeDir]);
    const bump = /BREAKING CHANGE|^[^\n]*!:/m.test(messages)
      ? "major"
      : /^(feat)(\([^)]*\))?:/m.test(messages)
        ? "minor"
        : bumpArg;
    const next = bumpVersion(item.stack.version, bump);
    item.stack.version = next;
    item.pkg.version = next;
    await writeJson(join(item.dir, "stack.json"), item.stack);
    await writeJson(join(item.dir, "package.json"), item.pkg);
  }
  console.log(`Stack version: ${rootPackage.version}`);
}

if (command === "manifest") await manifest();
else if (command === "assets") await assets();
else await version();

// jscpd:ignore-end
