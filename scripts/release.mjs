// jscpd:ignore-start -- release manifest and archive generation intentionally share the same package metadata traversal
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const pluginsDir = join(root, "plugins");
const groups = ["agents", "ai", "core", "integrations", "trading", "ux", "vcs"];
const command = process.argv[2];
const bumpArg = process.argv[3] ?? "patch";

if (!["manifest", "version", "assets"].includes(command)) {
  console.error("usage: node scripts/release.mjs <manifest|version|assets> [major|minor|patch]");
  process.exit(2);
}
if (command === "version" && !new Set(["major", "minor", "patch"]).has(bumpArg)) {
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
/** Run a repository command and return trimmed stdout. */
async function exec(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, { cwd: root, ...options });
  return stdout.trim();
}
/** Calculate the next semantic version for a requested bump kind. */
function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (![major, minor, patch].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error(`invalid semver: ${version}`);
  }
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Discover publishable native packages beneath the logical plugin groups. */
async function discoverPackages() {
  const packages = [];
  for (const group of groups) {
    let entries = [];
    try {
      entries = await fs.readdir(join(pluginsDir, group), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(pluginsDir, group, entry.name);
      try {
        const [stack, pkg] = await Promise.all([
          readJson(join(dir, "stack.json")),
          readJson(join(dir, "package.json")),
        ]);
        if (typeof stack?.id !== "string") continue;
        packages.push({ dir, stack, pkg, relativePath: `${group}/${entry.name}` });
      } catch {
        // Private/non-published packages without stack.json are not release components.
      }
    }
  }
  packages.sort((a, b) => a.stack.id.localeCompare(b.stack.id));
  return packages;
}

/** Build the machine-readable release manifest for all native KiKi packages. */
async function buildManifest() {
  const rootPackage = await readJson(join(root, "package.json"));
  const packages = await discoverPackages();
  const byId = new Map(packages.map((item) => [item.stack.id, item]));
  return {
    format: 2,
    stack: { name: rootPackage.name, version: rootPackage.version },
    packages: packages.map(({ stack, pkg, dir }) => ({
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
    })),
  };
}

/** Write the release manifest and its integrity checksum. */
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

/** Stage and archive one native plugin package for release. */
async function zipPackage(component, outputDir, stageDir) {
  const slug = component.relativePath.replaceAll("/", "-");
  const version = component.pkg.version ?? component.stack.version ?? "0.0.0";
  const archive = join(outputDir, `plugin-${slug}-${version}.zip`);
  const staged = join(stageDir, slug);
  await fs.mkdir(stageDir, { recursive: true });
  await fs.cp(component.dir, staged, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (source) => !relative(component.dir, source).split("/").includes("node_modules"),
  });
  await exec("zip", ["-qr", archive, "."], { cwd: staged });
  return archive;
}

/** Generate all release assets and their checksum inventory. */
async function assets() {
  const outputDir = join(root, ".release");
  const stageDir = join(outputDir, ".stage");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await manifest();

  const archives = [];
  for (const component of await discoverPackages()) {
    archives.push(await zipPackage(component, outputDir, stageDir));
  }
  await fs.rm(stageDir, { recursive: true, force: true });

  await writeJson(join(outputDir, "component-assets.json"), {
    format: 2,
    plugins: archives.map((file) => relative(outputDir, file)),
    total: archives.length,
  });

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
  console.log(`Generated ${archives.length} plugin ZIPs`);
}

/** Bump the root and changed package versions according to commit history. */
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

  for (const item of await discoverPackages()) {
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
