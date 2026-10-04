#!/usr/bin/env node
// jscpd:ignore-start -- per-package CLI entrypoint boilerplate (arg parsing, help text), duplicated by design across sibling CLI packages
/**
 * The `dsh lsp` command: the owner surface over the lsp server table. It
 * reads/writes the `lsp` section of `settings.yaml` under the same agent
 * home the harness boots (DSH_HOME); the plugin mounts those servers on the
 * next boot.
 *
 * Verbs:
 *   list                       — installed LSP servers (id, command, extensions)
 *   servers add <id> <command> — add a stdio server (--ext=.ts=typescript, --args=...)
 *   servers remove <id>        — delete a server entry
 */

import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

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

/** parseJsonValue implementation. */
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

/** readServers implementation. */
async function readServers() {
  try {
    const text = await readFile(settingsPath, "utf8");
    const section = {};
    for (const [key, value] of readSection(text, "lsp")) {
      section[key] = parseJsonValue(value);
    }
    return section;
  } catch {
    /* no document yet */
  }
  return {};
}

/** writeServers implementation. */
async function writeServers(servers) {
  let text = "";
  try {
    text = await readFile(settingsPath, "utf8");
  } catch {
    /* new file */
  }
  const pattern = /^lsp[^\n]*\n(?:[ \t][^\n]*\n)*/m;
  const section = `lsp:\n  servers: ${JSON.stringify(servers.servers ?? {})}\n`;
  const without = text.replace(pattern, "");
  const rest = without.replace(/\n{3,}/g, "\n\n").trim();
  const out = `${rest}${rest.endsWith("\n") ? "" : "\n"}${section}`;
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, out, "utf8");
}

/** printHelp implementation. */
function printHelp() {
  process.stdout.write(`usage: dsh lsp <verb> [args]

verbs:
  list
  servers add <id> <command> [--ext=.ts=typescript] [--args=a b c]
  servers remove <id>
`);
}

/** main implementation. */
async function main() {
  const verb = process.argv[2];
  const argv = process.argv.slice(3);

  if (verb === "list") {
    const servers = await readServers();
    const entries = Object.entries(servers.servers ?? {});
    if (entries.length === 0) {
      process.stdout.write("no LSP servers configured\n");
      return;
    }
    for (const [id, cfg] of entries) {
      const ext = Object.keys(cfg.extensionToLanguage ?? {}).join(",") || "—";
      process.stdout.write(`${id}    ${cfg.command}    ${ext}\n`);
    }
    return;
  }

  if (verb === "servers" && argv[0] === "add") {
    const id = argv[1];
    const command = argv[2];
    if (!id || !command) {
      process.stderr.write("dsh lsp servers add: missing id or command\n");
      process.exitCode = 1;
      return;
    }
    const extensionToLanguage = {};
    const args = [];
    for (const arg of argv.slice(3)) {
      if (arg.startsWith("--ext=")) {
        const spec = arg.slice(6);
        const [ext, lang] = spec.split("=");
        if (ext && lang) extensionToLanguage[ext] = lang;
      } else if (arg.startsWith("--args=")) {
        args.push(...arg.slice(7).split(" ").filter(Boolean));
      }
    }
    const servers = await readServers();
    const table = servers.servers ?? {};
    table[id] = { command, extensionToLanguage, ...(args.length > 0 ? { args } : {}) };
    await writeServers({ ...servers, servers: table });
    process.stdout.write(`added LSP server ${id} -> ${command}\n`);
    return;
  }

  if (verb === "servers" && argv[0] === "remove") {
    const id = argv[1];
    if (!id) {
      process.stderr.write("dsh lsp servers remove: missing id\n");
      process.exitCode = 1;
      return;
    }
    const servers = await readServers();
    const table = servers.servers ?? {};
    if (table[id] === undefined) {
      process.stderr.write(`dsh lsp servers remove: no server "${id}"\n`);
      process.exitCode = 1;
      return;
    }
    delete table[id];
    await writeServers({ ...servers, servers: table });
    process.stdout.write(`removed LSP server ${id}\n`);
    return;
  }

  printHelp();
}

main().catch((err) => {
  process.stderr.write(`dsh lsp: ${err.message}\n`);
  process.exitCode = 1;
});

// jscpd:ignore-end
