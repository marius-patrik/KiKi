// jscpd:ignore-start -- shared release-tooling boilerplate, intentionally mirrored between pack.mjs and release.mjs
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const command = process.argv[2];
if (!["build", "typecheck", "test", "verify"].includes(command)) {
  console.error("usage: node pack.mjs <build|typecheck|test|verify>");
  process.exit(2);
}

const root = process.cwd();
const repositoryRoot = resolve(root, "../../..");

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
 * Scans `plugins`, `plugins`, and `bundles` for
 * directories containing a `stack.json` manifest, returning a Map of
 * stack id to `{ dir, manifest }`.
 *
 * Catalog roots that do not exist and directories without a readable
 * `stack.json` are silently skipped.
 */
async function discoverStackPackages() {
  const byId = new Map();
  for (const catalogRoot of ["plugins", "plugins", "bundles"]) {
    const catalogDir = join(repositoryRoot, catalogRoot);
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
        const manifest = await readJson(join(dir, "stack.json"));
        if (typeof manifest.id === "string") byId.set(manifest.id, { dir, manifest });
      } catch {}
    }
  }
  return byId;
}

const stack = await readJson(join(root, "stack.json"));
const packages = await discoverStackPackages();
const dependencyIds = Array.isArray(stack.dependencies) ? stack.dependencies : [];
const dependencies = dependencyIds.map((id) => {
  const found = packages.get(id);
  if (!found) throw new Error(`Pack ${stack.id} references missing Stack package ${id}`);
  return { id, ...found };
});

dependencies.sort((a, b) => a.id.localeCompare(b.id));

/**
 * Reports whether a dependency declares the command as a package script.
 *
 * Presence is checked in the manifest rather than delegated to
 * `bun run --if-present`: when a script is absent, bun falls through to
 * resolving the name as an executable on PATH, so a dependency without a
 * `test` script picks up `/bin/test` and fails with an unrelated error
 * instead of being skipped.
 *
 * @param {{ dir: string }} child - The dependency to inspect.
 * @returns {Promise<boolean>} True when the command is a declared script.
 */
async function declaresCommand(child) {
  try {
    const manifest = await readJson(join(child.dir, "package.json"));
    return typeof manifest.scripts?.[command] === "string";
  } catch {
    return false;
  }
}

/**
 * Spawns `bun run <command>` in a dependency's directory, inheriting stdio.
 * Resolves on exit code 0; rejects with an Error on non-zero exit or signal
 * termination.
 *
 * @param {{ dir: string, id: string }} child - The dependency to run against.
 * @throws When the spawned process exits non-zero or is killed by a signal.
 */
const run = (child) =>
  new Promise((resolvePromise, reject) => {
    const childProcess = spawn("bun", ["run", command], {
      cwd: child.dir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    childProcess.on("error", reject);
    childProcess.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${child.id} ${command} terminated by ${signal}`));
      else if (code === 0) resolvePromise();
      else reject(new Error(`${child.id} ${command} exited with ${code}`));
    });
  });

let ran = 0;
for (const dependency of dependencies) {
  if (!(await declaresCommand(dependency))) continue;
  await run(dependency);
  ran += 1;
}
console.log(`${command}: ${ran} of ${dependencies.length} Stack dependencies`);

// jscpd:ignore-end
