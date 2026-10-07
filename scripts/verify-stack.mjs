// jscpd:ignore-start -- shared release-tooling boilerplate (module header), intentionally mirrored across scripts/*.mjs
import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
// One implementation tree: every plugin lives in plugins/. The former
// src/packages and publish/extensions roots were the same directory twice, which
// made this verifier compare each file against itself.
const pluginsDir = join(root, "plugins");
const packsDir = join(root, "bundles");
const codeExts = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const ignoredDirs = new Set(["node_modules", ".git", "dist", "coverage", "lib"]);
let gitlinkPaths = new Set();
const generatedFileNames = new Set([
  "package-lock.json",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const errors = [];
const packageNames = new Map();
const stackIds = new Map();
const publicPackages = new Map();
const sourceHashes = new Map();

/** Records a verification error for reporting after all checks complete. */
function fail(message) {
  errors.push(message);
}
/** Records a verification error when `condition` is falsy. */
function assert(condition, message) {
  if (!condition) fail(message);
}

/**
 * Reads and parses a JSON file, recording a verification error on failure.
 * Returns the parsed object, or undefined when the file is unreadable.
 */
async function readJson(path, label) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

/** Returns true when the path is accessible, false otherwise. */
async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/** Recursively yields file paths under `dir`, skipping directories in `ignoredDirs`. */
async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/**
 * Returns paths of generated output (`lib/`, `dist/`, `node_modules/`) that
 * are tracked by git and should not be committed. Records a verification
 * error when `git ls-files` itself fails; returns an empty array in that case.
 */
async function trackedGeneratedFiles() {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "ls-files",
        "--",
        "plugins/**/lib/**",
        "plugins/**/dist/**",
        "plugins/**/node_modules/**",
        "bundles/**/lib/**",
        "bundles/**/dist/**",
        "bundles/**/node_modules/**",
      ],
      { cwd: root },
    );
    return stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch (error) {
    fail(`unable to inspect tracked generated files: ${error.message}`);
    return [];
  }
}

/**
 * Validates a single canonical package directory against the Stack package
 * contract: ESM module type, unique package name, stack.json structure
 * (namespaced id, valid kind, semver version, declared files), and cross-
 * reference consistency between package.json and stack.json.
 */
async function verifyCanonicalPackage(dir) {
  const relDir = relative(root, dir);
  const packagePath = join(dir, "package.json");
  const stackPath = join(dir, "stack.json");
  const packageManifest = await readJson(packagePath, relative(root, packagePath));
  assert(packageManifest?.type === "module", `${relative(root, packagePath)} must use ESM`);
  assert(
    typeof packageManifest?.name === "string" && packageManifest.name.length > 0,
    `${relative(root, packagePath)} must declare a package name`,
  );

  if (packageManifest?.name) {
    const previous = packageNames.get(packageManifest.name);
    if (previous)
      fail(
        `duplicate package name ${packageManifest.name}: ${previous} and ${relative(root, packagePath)}`,
      );
    else packageNames.set(packageManifest.name, relative(root, packagePath));
  }

  const stack = await readJson(stackPath, relative(root, stackPath));
  if (packageManifest?.private === true) {
    assert(!stack, `${relative(root, packagePath)} is private and must not publish stack.json`);
    return;
  }

  assert(stack, `${relDir} must declare stack.json`);
  if (!stack) return;

  const label = relative(root, stackPath);
  if (typeof stack.id === "string") {
    const previous = stackIds.get(stack.id);
    if (previous) fail(`duplicate Stack id ${stack.id}: ${previous} and ${label}`);
    else stackIds.set(stack.id, label);
  }
  publicPackages.set(stack.id, { dir, stack });

  assert(
    typeof stack.id === "string" && /^stack\.[a-z0-9][a-z0-9.-]*$/.test(stack.id),
    `${label} id must be namespaced`,
  );
  assert(["plugin", "bundle", "library"].includes(stack.kind), `${label} has invalid kind`);
  assert(
    typeof stack.version === "string" && /^\d+\.\d+\.\d+$/.test(stack.version),
    `${label} must have a semver version`,
  );
  assert(
    typeof stack.name === "string" && /^@dsh-stack\//.test(stack.name),
    `${label} must have an @dsh-stack package name`,
  );
  assert(
    typeof stack.description === "string" && stack.description.length > 0,
    `${label} must have a description`,
  );
  assert(
    Array.isArray(stack.files) && stack.files.length > 0,
    `${label} must declare published files`,
  );
  assert(Array.isArray(stack.dependencies ?? []), `${label} dependencies must be an array`);
  assert(
    Array.isArray(stack.optionalDependencies ?? []),
    `${label} optionalDependencies must be an array`,
  );
  if (stack.kind === "plugin")
    assert(
      await exists(join(dir, "src")),
      `${label} declares a ${stack.kind} but has no src/ directory`,
    );
  assert(
    packageManifest?.stack?.id === stack.id,
    `${relative(root, packagePath)} stack.id does not match stack.json`,
  );

  for (const publishedPath of stack.files) {
    if (
      generatedFileNames.has(publishedPath) ||
      publishedPath === "lib" ||
      publishedPath === "dist"
    )
      continue;
    assert(
      await exists(join(dir, publishedPath)),
      `${stack.id} publishes missing path ${publishedPath}`,
    );
  }
}

/**
 * Validates the single plugin tree under `plugins/`: every folder is a real
 * implementation, not a re-export of one.
 *
 * This replaces the composition-wrapper gate that policed `publish/plugins`,
 * where 74 folders each held a generic `src/index.mjs` that resolved a canonical
 * package elsewhere and re-exported it. That tree is gone, and with it the shape
 * of the guarantee: the thing worth forbidding now is a plugin that is only an
 * indirection to another plugin in this same tree, because that reintroduces the
 * duplicate owner the single tree exists to prevent.
 */
async function verifyPluginTree() {
  const children = await fs.readdir(pluginsDir, { withFileTypes: true });
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const dir = join(pluginsDir, child.name);
    if (gitlinkPaths.has(relative(root, dir))) continue;
    const packagePath = join(dir, "package.json");
    if (!(await exists(packagePath))) continue;
    const manifest = await readJson(packagePath, relative(root, packagePath));
    if (manifest?.stack?.kind === "bundle") continue;

    assert(manifest?.type === "module", `${relative(root, packagePath)} must use ESM`);
    assert(
      typeof manifest?.name === "string" && manifest.name.startsWith("@dsh-stack/"),
      `${relative(root, packagePath)} must declare an @dsh-stack/* name`,
    );

    // A plugin owns its implementation: at least one real source file of its own.
    const ownsSource = ["src", "client.js", "bin"].some((entry) => existsSync(join(dir, entry)));
    assert(
      ownsSource,
      `${relative(root, dir)} owns no implementation; every plugin must implement something itself`,
    );

    // The specific indirection the old tree was built from: an entry module that
    // only re-exports a sibling plugin's implementation.
    const entry = join(dir, "src", "index.mjs");
    if (await exists(entry)) {
      const source = await fs.readFile(entry, "utf8");
      const reexportsSibling =
        /export\s+(?:const|default|\{[^}]*\})[^;]*from\s*["'][^"']*plugins\//.test(source) ||
        /await import\(\s*manifest\.name\s*\)/.test(source);
      assert(
        !reexportsSibling,
        `${relative(root, entry)} re-exports another plugin's implementation; a plugin must be its own owner`,
      );
    }
  }
}

/**
 * Runs the complete Stack verification pass: checks directory existence,
 * generated-file cleanliness, per-package contract compliance, plugin tree
 * wiring, cross-package dependency resolution, and source-level invariants
 * (no TODO/FIXME markers, no `as any` casts, no plugins/ imports). Exits
 * non-zero when any check fails.
 */
async function main() {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--stage"]);
    gitlinkPaths = new Set(
      stdout
        .split("\n")
        .filter(Boolean)
        .filter((line) => line.startsWith("160000 "))
        .map((line) => line.slice(line.indexOf("\t") + 1)),
    );
  } catch {
    gitlinkPaths = new Set();
  }

  assert(await exists(pluginsDir), "plugins/ implementation root is missing");
  assert(await exists(packsDir), "packs/ bundle root is missing");
  for (const file of await trackedGeneratedFiles()) fail(`${file} is checked-in generated output`);

  for (const canonicalRoot of [pluginsDir, packsDir]) {
    if (!(await exists(canonicalRoot))) continue;
    const packageChildren = await fs.readdir(canonicalRoot, { withFileTypes: true });
    for (const child of packageChildren) {
      if (!child.isDirectory() || ignoredDirs.has(child.name)) continue;
      if (gitlinkPaths.has(relative(root, join(canonicalRoot, child.name)))) continue;
      assert(
        await exists(join(canonicalRoot, child.name, "package.json")),
        `${relative(root, join(canonicalRoot, child.name))} must contain package.json`,
      );
      await verifyCanonicalPackage(join(canonicalRoot, child.name));
    }
  }

  await verifyPluginTree();

  for (const [id, { stack }] of publicPackages) {
    for (const dependency of [
      ...(stack.dependencies ?? []),
      ...(stack.optionalDependencies ?? []),
    ]) {
      assert(
        typeof dependency === "string" && publicPackages.has(dependency),
        `${id} references missing Stack package ${String(dependency)}`,
      );
    }
  }

  for (const sourceRoot of [pluginsDir, packsDir]) {
    if (!(await exists(sourceRoot))) continue;
    for await (const file of walk(sourceRoot)) {
      const rel = relative(root, file).replaceAll("\\", "/");
      const ext = rel.slice(rel.lastIndexOf("."));
      if (!codeExts.has(ext)) continue;
      const text = await fs.readFile(file, "utf8");
      const lower = text.toLowerCase();
      // Word-boundary match: a bare substring trips real identifiers like
      // `autodoc` or `applyPaletteToDOM` (see #109) that contain "todo" but
      // aren't placeholders.
      for (const marker of [/\btodo\b/, /\bfixme\b/, /\bnot implemented\b/, "initialized: true"])
        assert(
          typeof marker === "string" ? !lower.includes(marker) : !marker.test(lower),
          `${rel} contains unfinished or placeholder marker ${marker}`,
        );
      assert(!/\bas any\b/.test(text), `${rel} contains an unchecked 'as any' cast`);
      assert(
        !/(?:from\s+|import\s*\()(['"]).*plugins\//.test(text),
        `${rel} imports implementation code from plugins/`,
      );
      if (text.length < 400) continue;
      const hash = createHash("sha256").update(text).digest("hex");
      const previous = sourceHashes.get(hash);
      if (previous && !/\/fixtures\/|\/snapshots\//.test(rel) && !/\/index\.(js|mjs|ts)$/.test(rel))
        fail(`duplicate source implementation: ${previous} and ${rel}`);
      else if (!previous) sourceHashes.set(hash, rel);
    }
  }

  assert(publicPackages.size > 0, "no canonical Stack packages found");
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(
    `Stack verification passed: ${publicPackages.size} public packages, ${packageNames.size} canonical manifests, ${sourceHashes.size} unique implementation source bodies.`,
  );
}

await main();

// jscpd:ignore-end
