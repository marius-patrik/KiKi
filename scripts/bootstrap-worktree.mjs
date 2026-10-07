#!/usr/bin/env node
/**
 * bootstrap-worktree — prepare a freshly-created git worktree for
 * `DSH_HOME=<worktree>/.data dsh --profile headless`.
 *
 * Steps:
 *  1. Locate the primary checkout and copy its built DSH/ into the worktree
 *     (excluding DSH's own .git, so the shared submodule pin is reused).
 *  2. Install workspace dependencies and build @dsh-stack/launcher.
 *  3. Create .data/ and seed it with settings.yaml + .credentials.yaml from the
 *     primary checkout, rewriting dsh-tweaks.homeRoot to the worktree's .data.
 *  4. Run a smoke test: `dsh --profile headless --help`.
 *
 * Usage:
 *   node src/scripts/bootstrap-worktree.mjs [--from <primary-checkout>] <worktree-path>
 *
 * @module @dsh-stack/scripts/bootstrap-worktree
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Run a command and return a promise that rejects on nonzero exit. */
function runCommand(name, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...(options.env || {}) },
      cwd: options.cwd,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}

/** Run git in a directory and return its trimmed stdout. */
async function git(cwd, args) {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const child = spawn("git", args, { cwd });
    child.stdout.on("data", (data) => {
      out += data;
    });
    child.stderr.on("data", (data) => {
      err += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} failed: ${err.trim() || out.trim()}`));
        return;
      }
      resolve(out.trim());
    });
  });
}

/**
 * Resolve the primary checkout root and the target worktree root.
 * @param targetPath - the worktree path passed on the CLI.
 * @param primaryFromFlag - optional explicit primary checkout path.
 * @returns `{ primaryRoot, targetRoot }`.
 */
export async function resolveRepoRoots(targetPath, primaryFromFlag) {
  const absTarget = resolve(targetPath);
  if (!existsSync(absTarget)) {
    throw new Error(`Target path does not exist: ${absTarget}`);
  }
  const toplevel = await git(absTarget, ["rev-parse", "--show-toplevel"]);
  let primaryRoot;
  if (primaryFromFlag) {
    primaryRoot = resolve(primaryFromFlag);
    if (!existsSync(join(primaryRoot, "DSH"))) {
      throw new Error(`Primary checkout missing DSH/: ${primaryRoot}`);
    }
  } else {
    const commonGitDir = await git(absTarget, ["rev-parse", "--git-common-dir"]);
    primaryRoot = dirname(resolve(absTarget, commonGitDir));
  }
  return { primaryRoot, targetRoot: toplevel };
}

/**
 * Rewrite the `dsh-tweaks.homeRoot` value inside a settings.yaml body.
 * @param settingsYaml - the raw settings.yaml contents.
 * @param homeRoot - the new absolute homeRoot path.
 * @returns the updated settings.yaml contents.
 */
export function rewriteHomeRoot(settingsYaml, homeRoot) {
  return settingsYaml.replace(/^([ \t]*homeRoot:[ \t]*).+$/m, `$1${homeRoot}`);
}

/** Copy the primary's built DSH/ into the worktree, excluding .git. */
async function copyHarness(primaryRoot, targetRoot) {
  const src = join(primaryRoot, "DSH");
  const dest = join(targetRoot, "DSH");
  if (!existsSync(src)) {
    throw new Error(`Primary DSH/ not found at ${src}`);
  }
  if (existsSync(dest)) {
    console.log(`Removing existing ${dest} before copy...`);
    await fs.rm(dest, { recursive: true, force: true });
  }
  console.log(`Copying DSH from ${src} to ${dest}...`);
  await fs.cp(src, dest, {
    recursive: true,
    preserveTimestamps: true,
    filter: (srcPath) => basename(srcPath) !== ".git",
  });
}

/** Install dependencies and build the launcher package. */
async function installAndBuild(targetRoot) {
  console.log("Running bun install...");
  await runCommand("bun install", "bun", ["install"], {
    cwd: targetRoot,
    env: { CI: "true" },
  });
  console.log("Building @dsh-stack/launcher...");
  await runCommand(
    "bun build launcher",
    "bun",
    ["run", "--filter", "@dsh-stack/launcher", "build"],
    {
      cwd: targetRoot,
    },
  );
}

/** Create .data/ and seed it from the primary checkout, rewriting homeRoot. */
async function seedData(primaryRoot, targetRoot) {
  const targetData = join(targetRoot, ".data");
  await fs.mkdir(targetData, { recursive: true });
  for (const file of ["settings.yaml", ".credentials.yaml"]) {
    const src = join(primaryRoot, ".data", file);
    const dest = join(targetData, file);
    if (!existsSync(src)) {
      console.log(`Skipping ${file}: not present in primary .data/`);
      continue;
    }
    console.log(`Copying .data/${file}...`);
    await fs.cp(src, dest, { preserveTimestamps: true });
    if (file === ".credentials.yaml") {
      await fs.chmod(dest, 0o600);
    }
  }
  const settingsPath = join(targetData, "settings.yaml");
  if (existsSync(settingsPath)) {
    const raw = await fs.readFile(settingsPath, "utf8");
    const updated = rewriteHomeRoot(raw, targetData);
    if (updated !== raw) {
      await fs.writeFile(settingsPath, updated, "utf8");
      console.log(`Rewrote dsh-tweaks.homeRoot to ${targetData}`);
    }
  }
}

/** Verify the launcher can resolve its own built output under the headless profile. */
async function smokeTest(targetRoot) {
  const bin = join(targetRoot, "plugins", "launcher", "bin", "dsh.mjs");
  if (!existsSync(bin)) {
    throw new Error(`Launcher bin missing at ${bin}`);
  }
  console.log("Running smoke test: dsh --profile headless --help");
  await runCommand("dsh smoke test", process.execPath, [bin, "--help"], {
    cwd: targetRoot,
    env: {
      DSH_HOME: join(targetRoot, ".data"),
      DSH_PROFILE: "headless",
    },
  });
  console.log("Smoke test passed.");
}

/** Main entrypoint. */
async function main() {
  const args = process.argv.slice(2);
  let primaryFromFlag;
  let targetArg;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && i + 1 < args.length) {
      primaryFromFlag = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      targetArg = args[i];
    } else {
      console.error(`Unknown option: ${args[i]}`);
      process.exit(2);
    }
  }
  if (!targetArg) {
    console.error(
      "usage: node src/scripts/bootstrap-worktree.mjs [--from <primary-checkout>] <worktree-path>",
    );
    process.exit(2);
  }
  const { primaryRoot, targetRoot } = await resolveRepoRoots(targetArg, primaryFromFlag);
  console.log(`Primary root:  ${primaryRoot}`);
  console.log(`Worktree root: ${targetRoot}`);
  await copyHarness(primaryRoot, targetRoot);
  await installAndBuild(targetRoot);
  await seedData(primaryRoot, targetRoot);
  await smokeTest(targetRoot);
  console.log(`Worktree ${targetRoot} is ready for headless dispatch.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
