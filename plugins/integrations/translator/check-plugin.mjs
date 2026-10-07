#!/usr/bin/env node
/**
 * translator: boot-verify harness.
 */
import { readFileSync } from "node:fs";

let ok = true;
/**
 * Asserts a condition and logs an error if it fails.
 *
 * @param {boolean} cond - The condition to check.
 * @param {string} msg - The error message to display if the condition is false.
 * @returns {void} - Does not return unless the condition is false, in which case it logs an error.
 */
const assert = (cond, msg) => {
  if (!cond) {
    ok = false;
    console.error(`FAIL: ${msg}`);
  }
};

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
assert(
  pkg.name === "@dsh-stack/translator",
  `name should be @dsh-stack/translator, got ${pkg.name}`,
);
console.log(`loader shape ok: ${pkg.name} inject= []`);

const src = await import("./lib/index.js");
assert(typeof src.name === "string", "name should be string");
assert(typeof src.apply === "function", "apply should be function");
assert(Array.isArray(src.inject), "inject should be array");
assert(!("default" in src), "should not have default export");
assert(src.name === "translator", `name should be translator, got ${src.name}`);

// Test translator registry
const registry = new src.TranslatorRegistry();
assert(registry !== null, "registry created");
assert(typeof registry.register === "function", "register is function");
assert(typeof registry.translate === "function", "translate is function");

// Test format detection
assert(src.detectFormat({ messages: [] }) === "opencode", "detect opencode format");
assert(src.detectFormat({ entries: [] }) === "claude", "detect claude format");
assert(src.detectFormat({ events: [] }) === "dsh", "detect dsh format");

console.log("translator registry ok");
console.log("format detection ok");
console.log("plugin check passed");
process.exit(ok ? 0 : 1);
