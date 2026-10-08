#!/usr/bin/env node
/**
 * `dsh stats` — observability verb: prints the harness's persisted projection
 * cache rows (turns, steps, llm/tool ms, ttft/decode ms, output tokens) for
 * every session under the current workspace. The cache is the durable fold
 * shortcut the web UI reads, so these are the same numbers the UI shows.
 *
 * Usage: dsh stats [--format table|json|csv] [--cwd <path>] [--json]
 */

import { resolveHome } from "@dsh-stack/tweaks/home";
import { listAllSessions, formatTable, formatCsv, formatJson } from "../lib/stats.js";

const args = process.argv.slice(2);
const formatIndex = args.indexOf("--format");
const format = args.includes("--json")
  ? "json"
  : formatIndex >= 0
    ? args[formatIndex + 1]
    : "table";
const cwdIndex = args.indexOf("--cwd");
const cwd = cwdIndex >= 0 ? args[cwdIndex + 1] : undefined;

const home = await resolveHome();
const rows = await listAllSessions(home, cwd);
const output =
  format === "json" ? formatJson(rows) : format === "csv" ? formatCsv(rows) : formatTable(rows);
console.log(output);
