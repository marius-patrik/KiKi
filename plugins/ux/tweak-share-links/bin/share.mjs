#!/usr/bin/env node
/**
 * `dsh share <sessionId>` — publish a read-only share link for one session.
 * Interactive (token-gated) sharing is opt-in: pass `--interactive` and the
 * `tweaks.share.allowInteractive` setting must be true. Prints the URL.
 *
 * Usage: dsh share <sessionId> [--interactive] [--advertised-host <host>]
 */

import { resolveHome } from "@dsh-stack/tweaks/home";
import { generateToken, writeShareToken } from "../lib/share.js";

const args = process.argv.slice(2);
const sessionId = args.find((arg) => !arg.startsWith("--"));
if (sessionId === undefined) {
  console.error("usage: dsh share <sessionId> [--interactive] [--advertised-host <host>]");
  process.exit(1);
}
const interactive = args.includes("--interactive");
const hostIndex = args.indexOf("--advertised-host");
const advertisedHost = hostIndex >= 0 ? args[hostIndex + 1] : undefined;

const home = await resolveHome();
const token = interactive ? await generateToken() : undefined;
if (token !== undefined) await writeShareToken(home, token);
const host = advertisedHost ?? "127.0.0.1:3080";
const base = "/share";
const url = `http://${host}${base}/${sessionId}${token === undefined ? "" : `?token=${token}`}`;
console.log(url);
