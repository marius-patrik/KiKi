#!/usr/bin/env node
// jscpd:ignore-start -- per-package CLI entrypoint boilerplate (arg parsing, help text), duplicated by design across sibling CLI packages
/**
 * The `dsh tool` command: the owner surface over the agent-tools config-file
 * custom tool registry. It reads/writes the `agent-tools` section of
 * `settings.yaml` under the same agent home the harness boots (DSH_HOME); the
 * plugin registers those tools on the next boot.
 *
 * Verbs:
 *   list                          — configured custom tools
 *   add <name> <description> <cmd...>  — add a tool (e.g. `dsh tool add lint-python 'Lint a python file' ruff check`)
 *   remove <name>                 — delete a custom tool
 */

import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const home = resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
const settingsPath = join(home, "settings.yaml");
const NS = "agent-tools";

/**
 * Yields key-value pairs from the specified section in the given text.
 *
 * The caller must provide a text containing sections separated by headers
 * and the section name to read. It returns key-value pairs for lines within
 * the section. If the section is not found or the text is malformed, it yields
 * nothing.
 */
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
 * Parses a JSON value from a string.
 *
 * Guarantees returning the parsed JSON value if valid, or `null` if the input is an empty string or "null".
 * Falls through without erroring if the input is an invalid JSON string, boolean, or null.
 *
 * @param raw - The string to parse as JSON.
 * @returns The parsed JSON value or `null` if the input is invalid.
 */
function parseJsonValue(raw) {
  if (raw === "" || raw === "null") return null;
  if (raw[0] === "{" || raw[0] === "[") {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (raw !== "" && Number.isFinite(num)) return num;
  return raw;
}

/**
 * Reads and parses JSON data from a section.
 *
 * Guarantees returning the parsed JSON data if valid, or `null` if the input is an empty string or "null".
 * Falls through without erroring if the input is an invalid JSON string, boolean, or null.
 *
 * @returns The parsed JSON data or `null` if the input is invalid.
 */
async function readSectionData() {
  try {
    const text = await readFile(settingsPath, "utf8");
    const section = {};
    for (const [key, value] of readSection(text, NS)) {
      section[key] = parseJsonValue(value);
    }
    return section;
  } catch {
    /* no document yet */
  }
  return {};
}

/** writeSectionData implementation. */
async function writeSectionData(section) {
  let text = "";
  try {
    text = await readFile(settingsPath, "utf8");
  } catch {
    /* new file */
  }
  const pattern = /^agent-tools[^\n]*\n(?:[ \t][^\n]*\n)*/m;
  const block = `agent-tools:\n  tools: ${JSON.stringify(section.tools ?? {})}\n`;
  const without = text.replace(pattern, "");
  const rest = without.replace(/\n{3,}/g, "\n\n").trim();
  const out = `${rest}${rest.endsWith("\n") ? "" : "\n"}${block}`;
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, out, "utf8");
}

/** printHelp implementation. */
function printHelp() {
  process.stdout.write(`usage: dsh tool <verb> [args]

verbs:
  list
  add <name> <description> <command...>   e.g. dsh tool add lint-py 'Lint a python file' ruff check
  remove <name>
`);
}

/**
 * Updates the section data in the settings file.
 * Ensures the file exists and contains the updated section.
 * If the file does not exist, it creates a new one with the section data.
 * Throws an error if reading or writing the file fails.
 * @param {Object} section - The section data to write.
 */
async function main() {
  const verb = process.argv[2];
  const argv = process.argv.slice(3);

  if (verb === "list") {
    const section = await readSectionData();
    const entries = Object.entries(section.tools ?? {});
    if (entries.length === 0) {
      process.stdout.write("no custom tools configured\n");
      return;
    }
    for (const [name, cfg] of entries) {
      process.stdout.write(
        `${name}\n    ${cfg.description ?? ""}\n    ${(cfg.command ?? []).join(" ")}\n`,
      );
    }
    return;
  }

  if (verb === "add") {
    const name = argv[0];
    const description = argv[1];
    const command = argv.slice(2);
    if (!name || description === undefined || command.length === 0) {
      process.stderr.write("dsh tool add: expected <name> <description> <command...>\n");
      process.exitCode = 1;
      return;
    }
    const section = await readSectionData();
    section.tools ??= {};
    section.tools[name] = { description, command };
    await writeSectionData(section);
    process.stdout.write(`added tool ${name} -> ${command.join(" ")}\n`);
    return;
  }

  if (verb === "remove") {
    const name = argv[0];
    if (!name) {
      process.stderr.write("dsh tool remove: missing <name>\n");
      process.exitCode = 1;
      return;
    }
    const section = await readSectionData();
    if (section.tools?.[name] === undefined) {
      process.stderr.write(`dsh tool remove: no tool "${name}"\n`);
      process.exitCode = 1;
      return;
    }
    delete section.tools[name];
    await writeSectionData(section);
    process.stdout.write(`removed tool ${name}\n`);
    return;
  }

  printHelp();
}

main().catch((err) => {
  process.stderr.write(`dsh tool: ${err.message}\n`);
  process.exitCode = 1;
});

// jscpd:ignore-end
