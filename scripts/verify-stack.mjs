// jscpd:ignore-start -- repository-wide contract verifier
import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { extname, join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const pluginsDir = join(root, "plugins");
const groups = ["agents", "ai", "core", "integrations", "trading", "ux", "vcs"];
const ignoredDirs = new Set(["node_modules", ".git", "dist", "coverage", "lib"]);
const codeExts = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);
const errors = [];
const packageNames = new Map();
const stackIds = new Map();
const publicPackages = new Map();
const sourceHashes = new Map();

function fail(message) {
  errors.push(message);
}
function assert(condition, message) {
  if (!condition) fail(message);
}

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

async function nativePackageDirs() {
  const dirs = [];
  for (const group of groups) {
    const groupDir = join(pluginsDir, group);
    assert(await exists(groupDir), `plugins/${group}/ logical bundle is missing`);
    if (!(await exists(groupDir))) continue;
    assert(
      !(await exists(join(groupDir, "package.json"))),
      `plugins/${group}/ is organizational only and must not be a package`,
    );
    for (const entry of await fs.readdir(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignoredDirs.has(entry.name)) continue;
      const dir = join(groupDir, entry.name);
      assert(
        await exists(join(dir, "package.json")),
        `${relative(root, dir)} must contain package.json`,
      );
      if (await exists(join(dir, "package.json"))) dirs.push(dir);
    }
  }
  return dirs.sort();
}

async function trackedGeneratedFiles() {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--", "plugins/**/lib/**", "plugins/**/dist/**", "plugins/**/node_modules/**"],
      { cwd: root },
    );
    return stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch (error) {
    fail(
      `unable to inspect tracked generated files: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function verifyPackage(dir) {
  const packagePath = join(dir, "package.json");
  const stackPath = join(dir, "stack.json");
  const pkg = await readJson(packagePath, relative(root, packagePath));
  assert(pkg?.type === "module", `${relative(root, packagePath)} must use ESM`);
  assert(
    typeof pkg?.name === "string" && pkg.name.startsWith("@dsh-stack/"),
    `${relative(root, packagePath)} must declare an @dsh-stack/* name`,
  );

  if (typeof pkg?.name === "string") {
    const previous = packageNames.get(pkg.name);
    if (previous)
      fail(`duplicate package name ${pkg.name}: ${previous} and ${relative(root, packagePath)}`);
    else packageNames.set(pkg.name, relative(root, packagePath));
  }

  const stack = await readJson(stackPath, relative(root, stackPath));
  if (pkg?.private === true) {
    assert(!stack, `${relative(root, packagePath)} is private and must not publish stack.json`);
    return;
  }
  assert(stack, `${relative(root, dir)} must declare stack.json`);
  if (!stack) return;

  const id = stack.id;
  const label = relative(root, stackPath);
  if (typeof id === "string") {
    const previous = stackIds.get(id);
    if (previous) fail(`duplicate Stack id ${id}: ${previous} and ${label}`);
    else stackIds.set(id, label);
    publicPackages.set(id, { dir, stack });
  }
  assert(
    typeof id === "string" && /^stack\.[a-z0-9][a-z0-9.-]*$/.test(id),
    `${label} id must be namespaced`,
  );
  assert(
    ["plugin", "library"].includes(String(stack.kind)),
    `${label} has invalid kind ${String(stack.kind)}; logical bundles are folders, not packages`,
  );
  assert(
    typeof stack.version === "string" && /^\d+\.\d+\.\d+$/.test(stack.version),
    `${label} must have a semver version`,
  );
  assert(stack.name === pkg?.name, `${label} name must match package.json`);
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
  const pkgStack = pkg?.stack;
  assert(pkgStack?.id === id, `${relative(root, packagePath)} stack.id does not match stack.json`);
  if (stack.kind === "plugin") {
    const ownsSource = ["src", "client.js", "bin"].some((entry) => existsSync(join(dir, entry)));
    assert(ownsSource, `${relative(root, dir)} owns no implementation`);
  }
}

async function main() {
  assert(await exists(pluginsDir), "plugins/ implementation root is missing");
  assert(
    !(await exists(join(root, "bundles"))),
    "root bundles/ runtime composition tree must not exist",
  );
  for (const file of await trackedGeneratedFiles()) fail(`${file} is checked-in generated output`);

  const dirs = await nativePackageDirs();
  for (const dir of dirs) await verifyPackage(dir);

  for (const [id, { stack }] of publicPackages) {
    const required = Array.isArray(stack.dependencies) ? stack.dependencies : [];
    const optional = Array.isArray(stack.optionalDependencies) ? stack.optionalDependencies : [];
    for (const dependency of [...required, ...optional]) {
      assert(
        typeof dependency === "string" && publicPackages.has(dependency),
        `${id} references missing Stack package ${String(dependency)}`,
      );
    }
  }

  for (const group of groups) {
    const sourceRoot = join(pluginsDir, group);
    if (!(await exists(sourceRoot))) continue;
    for await (const file of walk(sourceRoot)) {
      const rel = relative(root, file).replaceAll("\\", "/");
      if (!codeExts.has(extname(rel))) continue;
      const text = await fs.readFile(file, "utf8");
      const lower = text.toLowerCase();
      for (const marker of [/\btodo\b/, /\bfixme\b/, /\bnot implemented\b/, "initialized: true"]) {
        assert(
          typeof marker === "string" ? !lower.includes(marker) : !marker.test(lower),
          `${rel} contains unfinished marker ${marker}`,
        );
      }
      assert(!/\bas any\b/.test(text), `${rel} contains an unchecked 'as any' cast`);
      assert(
        !/(?:from\s+|import\s*\()(['"]).*plugins\//.test(text),
        `${rel} imports implementation code from plugins/`,
      );
      if (text.length < 400) continue;
      const hash = createHash("sha256").update(text).digest("hex");
      const previous = sourceHashes.get(hash);
      if (
        previous &&
        !/\/fixtures\/|\/snapshots\//.test(rel) &&
        !/\/index\.(js|mjs|ts)$/.test(rel)
      ) {
        fail(`duplicate source implementation: ${previous} and ${rel}`);
      } else if (!previous) {
        sourceHashes.set(hash, rel);
      }
    }
  }

  assert(publicPackages.size > 0, "no canonical Stack packages found");
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(
    `Stack verification passed: ${publicPackages.size} public packages across ${groups.length} logical plugin bundles.`,
  );
}

await main();
// jscpd:ignore-end
