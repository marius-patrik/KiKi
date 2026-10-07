#!/usr/bin/env node
/**
 * Remove uninitialized plugin submodule placeholders before Bun enumerates
 * the native plugins/* workspace. Initialized submodules are left untouched.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

let staged;
try {
  staged = execFileSync("git", ["ls-files", "--stage"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  process.exit(0);
}

const pluginGitlinks = staged
  .split("\n")
  .filter(Boolean)
  .filter((line) => line.startsWith("160000 "))
  .map((line) => line.slice(line.indexOf("\t") + 1))
  .filter((path) => path.startsWith("plugins/"));

for (const path of pluginGitlinks) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) continue;

  let status = "";
  try {
    status = execFileSync("git", ["submodule", "status", "--", path], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    continue;
  }

  if (!status.startsWith("-")) continue;
  rmSync(absolute, { recursive: true, force: true });
  console.log(`Removed uninitialized plugin submodule placeholder: ${path}`);
}
