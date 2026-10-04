#!/usr/bin/env node
// jscpd:ignore-start -- per-package CLI entrypoint boilerplate (arg parsing, help text), duplicated by design across sibling CLI packages
/**
 * The `dsh agents` command: the owner surface over agents persona
 * authoring. It reads/writes the authoring directory (the `agents` root,
 * default `<home>/agents`) under the same agent home the harness boots
 * (DSH_HOME) and materializes presets into `<home>/.agent-presets`, where the
 * harness roster picks them up live.
 *
 * Verbs:
 *   list                     — personas and their materialized presets
 *   add <file>               — copy a persona file into the authoring root and sync
 *   remove <id>              — delete the persona file(s) for an id and sync
 *   sync                     — materialize every persona and prune stale presets
 */

import { homedir } from "node:os";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parsePersona, sanitizeId } from "../lib/persona.js";
import { basePresetDir, PRESET_ROOT, SOURCE_MARKER, syncPersonas } from "../lib/sync.js";
import { authoringRoot, defaultBase } from "../lib/settings.js";

const home = resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
const settingsPath = join(home, "settings.yaml");
const NS = "agents";

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

/** readSettings implementation. */
async function readSettings() {
  try {
    const text = await readFile(settingsPath, "utf8");
    const section = {};
    for (const [key, value] of readSection(text, NS)) section[key] = value;
    return section;
  } catch {
    return {};
  }
}

/** main implementation. */
async function main() {
  const verb = process.argv[2];
  const argv = process.argv.slice(3);

  if (!verb || verb === "help" || verb === "--help") {
    process.stdout.write(`usage: dsh agents <verb> [args]

verbs:
  list
  add <file>
  remove <id>
  sync
`);
    return;
  }

  const settings = await readSettings();
  const root = authoringRoot(
    home,
    { root: settings.root, defaultBase: settings.defaultBase },
    undefined,
  );
  const base = defaultBase({ root: settings.root, defaultBase: settings.defaultBase }, undefined);
  const baseDir = basePresetDir();
  await mkdir(root, { recursive: true });

  if (verb === "list") {
    const files = await readdir(root);
    let shown = 0;
    for (const file of files.sort()) {
      const extension = extname(file).toLowerCase();
      if (extension !== ".md" && extension !== ".json") continue;
      const filePath = join(root, file);
      let persona;
      try {
        persona = parsePersona(filePath, await readFile(filePath, "utf8"));
      } catch (error) {
        process.stdout.write(`${file}\n    UNPARSABLE: ${error.message}\n`);
        continue;
      }
      const presetDir = join(home, PRESET_ROOT, persona.id);
      const materialized = await exists(join(presetDir, SOURCE_MARKER));
      process.stdout.write(
        `${persona.id}\n    ${persona.name ?? persona.id}\n    ${persona.description ?? ""}\n    ` +
          `base: ${persona.base ?? base}${materialized ? " (materialized)" : ""}\n`,
      );
      shown += 1;
    }
    if (shown === 0) process.stdout.write("no personas in the authoring root\n");
    return;
  }

  if (verb === "add") {
    const source = resolve(argv[0] ?? "");
    if (!source) {
      process.stderr.write("dsh agents add: missing <file>\n");
      process.exitCode = 1;
      return;
    }
    const extension = extname(source).toLowerCase();
    if (extension !== ".md" && extension !== ".json") {
      process.stderr.write(
        `dsh agents add: unsupported persona file type "${extension}" (use .md or .json)\n`,
      );
      process.exitCode = 1;
      return;
    }
    const target = join(root, basename(source));
    if (resolve(target) === source) {
      process.stderr.write(`dsh agents add: ${source} is already in the authoring root\n`);
      process.exitCode = 1;
      return;
    }
    await cp(source, target);
    const report = await syncPersonas(home, root, baseDir);
    process.stdout.write(`added persona ${basename(target)}\n`);
    printReport(report);
    return;
  }

  if (verb === "remove") {
    const id = sanitizeId(argv[0] ?? "");
    if (!argv[0]) {
      process.stderr.write("dsh agents remove: missing <id>\n");
      process.exitCode = 1;
      return;
    }
    const matches = (await readdir(root)).filter(
      (file) => sanitizeId(basename(file, extname(file))) === id,
    );
    if (matches.length === 0) {
      process.stderr.write(`dsh agents remove: no persona with id "${id}"\n`);
      process.exitCode = 1;
      return;
    }
    if (matches.length > 1) {
      process.stderr.write(
        `dsh agents remove: ambiguous id "${id}" (${matches.join(", ")}); delete the file directly\n`,
      );
      process.exitCode = 1;
      return;
    }
    await rm(join(root, matches[0]));
    const report = await syncPersonas(home, root, baseDir);
    process.stdout.write(`removed persona ${id}\n`);
    printReport(report);
    return;
  }

  if (verb === "sync") {
    const report = await syncPersonas(home, root, baseDir);
    printReport(report);
    return;
  }

  process.stderr.write(`dsh agents: unknown verb "${verb}"\n`);
  process.exitCode = 1;
}

/** printReport implementation. */
function printReport(report) {
  for (const item of report.materialized) {
    process.stdout.write(
      `  materialized ${item.id}${item.base !== undefined ? ` (base ${item.base})` : " (bare persona)"}\n`,
    );
  }
  for (const id of report.pruned) process.stdout.write(`  pruned ${id}\n`);
  for (const failure of report.failed) process.stderr.write(`  failed: ${failure}\n`);
  if (
    report.materialized.length === 0 &&
    report.pruned.length === 0 &&
    report.failed.length === 0
  ) {
    process.stdout.write("  up to date\n");
  }
}

/** exists implementation. */
async function exists(path) {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  process.stderr.write(`dsh agents: ${err.message}\n`);
  process.exitCode = 1;
});

// jscpd:ignore-end
