#!/usr/bin/env node

/**
 * Browser acceptance for a booted dsh profile.
 *
 * Loads a running web profile in a real browser and asserts the Stack's own
 * surfaces are mounted, not merely that the process started and bound a port.
 * The plugin inventory proves entries activated; this proves the client actually
 * renders them, which is the only way a profile-level composition fault (a bundle
 * list missing the harness's base rows, say) cannot pass unnoticed — that fault
 * exits 0 after mounting and never serves a request at all.
 *
 * Usage: node src/scripts/browser-check.mjs <url> [--screenshot <path>]
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";

/** Text that only appears when the named Stack surface rendered. */
const REQUIRED_SURFACES = {
  "the session launcher": "New Session",
  "the Stack plugin inventory link": "Plugins",
  "the workspace tree": "WORKSPACES",
  "the session list": "Default",
  "the settings entry": "Settings",
};

/** Parse argv into the profile URL and an optional screenshot path. */
function parseArgs(argv) {
  const url = argv.find((arg) => arg.startsWith("http"));
  const at = argv.indexOf("--screenshot");
  return { url, screenshot: at === -1 ? null : (argv[at + 1] ?? null) };
}

const { url, screenshot } = parseArgs(process.argv.slice(2));
if (url === undefined) {
  process.stderr.write("usage: browser-check.mjs <url> [--screenshot <path>]\n");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // The token URL redirects to the app root, so wait for the shell the app
  // renders rather than the navigation itself.
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3_000);

  const title = await page.title();
  const text = await page.locator("body").innerText();

  const failures = [];
  if (title.trim() === "") failures.push("the page has no title");
  for (const [surface, marker] of Object.entries(REQUIRED_SURFACES)) {
    if (!text.includes(marker))
      failures.push(`${surface} did not render (no ${JSON.stringify(marker)})`);
  }

  process.stdout.write(`title: ${JSON.stringify(title)}\n`);
  process.stdout.write(`url: ${page.url()}\n`);
  for (const [surface, marker] of Object.entries(REQUIRED_SURFACES)) {
    process.stdout.write(`  ${text.includes(marker) ? "ok  " : "FAIL"} ${surface} (${marker})\n`);
  }
  process.stdout.write(`console errors: ${consoleErrors.length}\n`);
  for (const error of consoleErrors.slice(0, 5)) process.stdout.write(`  - ${error}\n`);

  if (screenshot !== null) {
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
    process.stdout.write(`screenshot: ${screenshot}\n`);
  }

  if (failures.length > 0) {
    process.stderr.write(`browser-check: ${failures.join("; ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("browser-check: profile rendered every required Stack surface\n");
  }
} finally {
  await browser.close();
}
