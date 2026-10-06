import { promises as fs } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const pluginsDir = join(root, "plugins");
const extensionsDir = join(root, "plugins");
const packsDir = join(root, "bundles");
const releaseDir = join(root, ".release");

/** Recursively discover plugin or pack directories, including symlinked component directories. */
async function discoverComponents(baseDir, relativePrefix = "") {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const components = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const dir = join(baseDir, entry.name);
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    let stat;
    try {
      stat = await fs.stat(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    try {
      await fs.access(join(dir, "package.json"));
      components.push(relativePath);
    } catch {
      components.push(...(await discoverComponents(dir, relativePath)));
    }
  }
  return components.sort();
}

/** Verify that one ZIP exists, is structurally valid, and contains a package manifest at its root. */
async function verifyArchive(archive) {
  await execFileAsync("unzip", ["-t", archive]);
  const { stdout } = await execFileAsync("unzip", ["-Z1", archive]);
  if (!stdout.split("\n").some((entry) => entry === "package.json")) {
    throw new Error(`Missing root package.json in ${archive}`);
  }
}

/** Verify that the release contains one valid ZIP for every plugin, extension and pack. */
async function main() {
  const inventory = JSON.parse(
    await fs.readFile(join(releaseDir, "component-assets.json"), "utf8"),
  );
  const expectedPlugins = (await discoverComponents(pluginsDir)).filter(
    (path) => !path.startsWith("packs/"),
  );
  const expectedExtensions = await discoverComponents(extensionsDir);
  const expectedPacks = await discoverComponents(packsDir);
  const versionSuffix = /-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.zip$/;
  const pluginZips = inventory.plugins
    .map((name) => name.replace(/^plugin-/, "").replace(versionSuffix, ""))
    .sort();
  const extensionZips = inventory.extensions
    .map((name) => name.replace(/^extension-/, "").replace(versionSuffix, ""))
    .sort();
  const packZips = inventory.packs
    .map((name) => name.replace(/^pack-/, "").replace(versionSuffix, ""))
    .sort();
  if (JSON.stringify(pluginZips) !== JSON.stringify(expectedPlugins)) {
    throw new Error(
      `Plugin ZIP inventory mismatch: expected ${expectedPlugins.length}, generated ${pluginZips.length}`,
    );
  }
  if (JSON.stringify(extensionZips) !== JSON.stringify(expectedExtensions)) {
    throw new Error(
      `Extension ZIP inventory mismatch: expected ${expectedExtensions.length}, generated ${extensionZips.length}`,
    );
  }
  if (JSON.stringify(packZips) !== JSON.stringify(expectedPacks)) {
    throw new Error(
      `Pack ZIP inventory mismatch: expected ${expectedPacks.length}, generated ${packZips.length}`,
    );
  }
  for (const asset of [...inventory.plugins, ...inventory.extensions, ...inventory.packs]) {
    const archive = join(releaseDir, asset);
    const stat = await fs.stat(archive);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Invalid release asset: ${asset}`);
    await verifyArchive(archive);
  }
  console.log(
    `Validated ${expectedPlugins.length} plugin ZIPs, ${expectedExtensions.length} extension ZIPs and ${expectedPacks.length} pack ZIPs.`,
  );
}

await main();
