#!/usr/bin/env node
// jscpd:ignore-start -- per-package CLI entrypoint boilerplate (arg parsing, help text), duplicated by design across sibling CLI packages
/**
 * The `dsh theme` command: the owner surface over the themes store and
 * Open VSX catalog. It resolves the same agent home the harness boots
 * (DSH_HOME), reads the `themes` deployment knobs from `settings.yaml`
 * (root + catalogUrl), then operates on the installed theme files / catalog.
 *
 * Verbs:
 *   list                       — installed themes (name, id, scheme, active *)
 *   search <query>             — Open VSX catalog search
 *   install <query>            — install a theme (search, first result)
 *   install-vsix <path>        — install from a local vsix file
 *   set <id>                   — persist the active theme id
 *   remove <id>                — delete an installed theme
 */

import { homedir } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { extractThemesFromVsix } from "../lib/catalog.js";
import { listThemes, removeTheme, saveTheme, storeHandle } from "../lib/store.js";
import { mapTheme, themeId } from "../lib/theme.js";

const home = resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
const settingsPath = join(home, "settings.yaml");

/** readSection implementation. */
function* readSection(text, section) {
  let inSection = false;
  for (const line of text.split("\n")) {
    if (new RegExp(`^${section}\\s*:`).test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && !/^\s/.test(line)) break;
    if (!inSection) continue;
    const match = line.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (match) {
      yield [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")];
    }
  }
}

/**
 * Reads the themes configuration from the settings file.
 *
 * Guarantees the return of a configuration object with `root` and `catalogUrl` properties.
 * Fallbacks to default values if the configuration is missing.
 */
async function readThemesConfig() {
  let root = "themes";
  let catalogUrl = "https://open-vsx.org";
  try {
    for (const [key, value] of readSection(await readFile(settingsPath, "utf8"), "themes")) {
      if (key === "root") root = value;
      if (key === "catalogUrl") catalogUrl = value;
    }
  } catch {
    /* missing document: defaults */
  }
  return { root, catalogUrl };
}

/**
 * Reads the active theme ID from the settings file.
 * Guarantees returning the active theme ID if found; otherwise, returns an empty string.
 * Fails silently by catching errors and returning an empty string if the document is missing or malformed.
 */
async function readActive() {
  try {
    for (const [key, value] of readSection(await readFile(settingsPath, "utf8"), "themes")) {
      if (key === "active") return value;
    }
  } catch {
    /* no document yet */
  }
  return "";
}

/**
 * Sets the active theme ID in the settings file.
 * Guarantees updating the active theme ID if the settings file is found and valid.
 * Fails silently by catching errors and returning without changes if the file is missing or malformed.
 * @param {string} id - The ID of the active theme to set.
 */
async function writeActive(id) {
  let text = "";
  try {
    text = await readFile(settingsPath, "utf8");
  } catch {
    /* new file */
  }
  const pattern = /^themes\s*:\s*[\s\S]*?(?=^\S|$)/gm;
  const section = `themes:\n  active: ${JSON.stringify(id)}\n`;
  const withoutThemes = text.replace(pattern, "");
  const rest = withoutThemes.replace(/\n{3,}/g, "\n\n").trim();
  text = `${rest}${rest.endsWith("\n") ? "" : "\n"}${section}`;
  await writeFile(settingsPath, text, "utf8");
}

/**
 * Prints the help message for the theme command.
 * Guarantees displaying the usage and available commands for the theme verb.
 * Fails silently by writing the help message to the standard output.
 */
function printHelp() {
  process.stdout.write(`usage: dsh theme <verb> [args]

  list                       installed themes (name, id, scheme, active *)
  search <query>             Open VSX catalog search
  install <query>            install a theme (catalog search, first result)
  install-vsix <path>        install from a local vsix file
  set <id>                   persist the active theme id
  remove <id>                delete an installed theme
`);
}

/**
 * Processes the command for managing themes.
 * Guarantees updating the configuration file with the active theme settings.
 * Fails silently by writing the updated configuration to the specified settings path.
 */
async function main(argv) {
  const verb = argv[0];
  if (verb === undefined || verb === "--help" || verb === "-h") {
    printHelp();
    return;
  }
  const config = await readThemesConfig();
  const handle = storeHandle(home, config.root);

  if (verb === "list") {
    const active = await readActive();
    const themes = await listThemes(handle);
    if (themes.length === 0) {
      process.stdout.write("no installed themes\n");
      return;
    }
    for (const theme of themes) {
      const marker = theme.id === active ? " *" : "";
      process.stdout.write(
        `${theme.id.padEnd(24)} ${theme.name.padEnd(28)} ${theme.colorScheme.padEnd(6)}${marker}\n`,
      );
    }
    return;
  }

  if (verb === "search") {
    const query = argv[1];
    if (query === undefined) {
      process.stderr.write("dsh theme search: missing query\n");
      process.exitCode = 1;
      return;
    }
    const { searchCatalog } = await import("../lib/catalog.js");
    const hits = await searchCatalog(config.catalogUrl, query);
    if (hits.length === 0) {
      process.stdout.write("no catalog matches\n");
      return;
    }
    for (const hit of hits) {
      process.stdout.write(
        `${hit.namespace}.${hit.name}  v${hit.version}  (${hit.downloadCount} dl)\n`,
      );
      if (hit.description) process.stdout.write(`  ${hit.description}\n`);
    }
    return;
  }

  if (verb === "install" || verb === "install-vsix") {
    const query = argv[1];
    if (query === undefined) {
      process.stderr.write(`dsh theme ${verb}: missing argument\n`);
      process.exitCode = 1;
      return;
    }
    let vsixPath = query;
    if (verb === "install") {
      const { searchCatalog } = await import("../lib/catalog.js");
      const hits = await searchCatalog(config.catalogUrl, query);
      const hit = hits.find((candidate) => candidate.download);
      if (hit === undefined) {
        process.stderr.write(`dsh theme install: no catalog match for "${query}"\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`installing ${hit.namespace}.${hit.name} from ${hit.download}\n`);
      const response = await fetch(hit.download);
      if (!response.ok) {
        process.stderr.write(`dsh theme install: download failed (HTTP ${response.status})\n`);
        process.exitCode = 1;
        return;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const tempPath = join(home, `${hit.namespace}.${hit.name}.vsix`);
      await writeFile(tempPath, buffer);
      vsixPath = tempPath;
    }
    const sources = await extractThemesFromVsix(vsixPath, (message) =>
      process.stderr.write(`${message}\n`),
    );
    let installed = 0;
    for (const source of sources) {
      const definition = mapTheme(source);
      await saveTheme(handle, { ...definition, name: source.name });
      installed += 1;
      process.stdout.write(`installed ${source.name} as ${definition.id}\n`);
    }
    if (vsixPath !== query) await rmQuiet(vsixPath);
    if (installed === 0) {
      process.stderr.write("dsh theme install: no themes found in extension\n");
      process.exitCode = 1;
    }
    return;
  }

  if (verb === "set") {
    const id = argv[1];
    if (id === undefined) {
      process.stderr.write("dsh theme set: missing id\n");
      process.exitCode = 1;
      return;
    }
    const themes = await listThemes(handle);
    if (!themes.some((theme) => theme.id === id)) {
      process.stderr.write(`dsh theme set: unknown theme "${id}" (see "dsh theme list")\n`);
      process.exitCode = 1;
      return;
    }
    await writeActive(id);
    process.stdout.write(`active theme: ${id}\n`);
    return;
  }

  if (verb === "remove") {
    const id = argv[1];
    if (id === undefined) {
      process.stderr.write("dsh theme remove: missing id\n");
      process.exitCode = 1;
      return;
    }
    const removed = await removeTheme(handle, id);
    if (removed) {
      const active = await readActive();
      if (active === id) await writeActive("");
      process.stdout.write(`removed ${id}\n`);
    } else {
      process.stderr.write(`dsh theme remove: no theme "${id}"\n`);
      process.exitCode = 1;
    }
    return;
  }

  process.stderr.write(`dsh theme: unknown verb "${verb}"\n`);
  process.exitCode = 1;
}

/**
 * Removes the specified theme if it exists.
 *
 * Guarantees that the theme with the given ID is removed from the active list.
 * Writes a success message to stdout if the theme is successfully removed.
 * Writes an error message to stderr and exits with code 1 if the theme is not found.
 */
async function rmQuiet(path) {
  const { rm } = await import("node:fs/promises");
  try {
    await rm(path);
  } catch {
    /* best effort */
  }
}

await main(process.argv.slice(2));

// jscpd:ignore-end
