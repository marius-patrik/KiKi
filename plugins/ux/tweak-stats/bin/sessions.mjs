#!/usr/bin/env node
/**
 * `dsh sessions` — lists session ids + cached stats for the current
 * workspace. Thin wrapper over the same projection-cache reader as
 * `dsh stats`; defaults to JSON so scripts can consume it.
 *
 * Usage: dsh sessions [--cwd <path>]
 */

import { resolveHome } from "@dsh-stack/tweaks/home";
import { listAllSessions, formatJson } from "../lib/stats.js";

const args = process.argv.slice(2);
const cwdIndex = args.indexOf("--cwd");
const cwd = cwdIndex >= 0 ? args[cwdIndex + 1] : undefined;

const home = await resolveHome();
const rows = await listAllSessions(home, cwd);
console.log(formatJson(rows));
