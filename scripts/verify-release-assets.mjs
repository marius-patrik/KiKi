import { promises as fs } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const pluginsDir = join(root, "plugins");
const releaseDir = join(root, ".release");
const groups = ["agents", "ai", "core", "integrations", "trading", "ux", "vcs"];

async function expectedPlugins() {
  const result = [];
  for (const group of groups) {
    for (const entry of await fs.readdir(join(pluginsDir, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        await fs.access(join(pluginsDir, group, entry.name, "stack.json"));
        result.push(`${group}-${entry.name}`);
      } catch {
        // Not a published release component.
      }
    }
  }
  return result.sort();
}

async function verifyArchive(archive) {
  await execFileAsync("unzip", ["-t", archive]);
  const { stdout } = await execFileAsync("unzip", ["-Z1", archive]);
  if (!stdout.split("\n").includes("package.json")) {
    throw new Error(`Missing root package.json in ${archive}`);
  }
}

async function main() {
  const inventory = JSON.parse(
    await fs.readFile(join(releaseDir, "component-assets.json"), "utf8"),
  );
  if (inventory.format !== 2 || !Array.isArray(inventory.plugins)) {
    throw new Error("Unsupported component-assets.json");
  }
  const suffix = /-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.zip$/;
  const actual = inventory.plugins
    .map((name) => name.replace(/^plugin-/, "").replace(suffix, ""))
    .sort();
  const expected = await expectedPlugins();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Plugin ZIP inventory mismatch: expected ${expected.length}, generated ${actual.length}`,
    );
  }
  for (const asset of inventory.plugins) {
    const archive = join(releaseDir, asset);
    const stat = await fs.stat(archive);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Invalid release asset: ${asset}`);
    await verifyArchive(archive);
  }
  console.log(`Validated ${expected.length} plugin ZIPs.`);
}

await main();
