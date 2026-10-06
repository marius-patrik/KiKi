import assert from "node:assert";
import { isAcceptableDoc } from "./is-acceptable-doc.mjs";

console.log("Testing isAcceptableDoc...");

// Test 1: Valid doc with @function echo
{
  const reply = `/**
 * @function rowIdFor
 * Strips the package prefix and normalises slashes to dashes.
 * @param {string} packageName - The package name to convert.
 * @returns {string} The transformed row identifier.
 */`;
  const target = { name: "rowIdFor", params: ["packageName"], code: "function rowIdFor(packageName) { return packageName.replace(/^@dsh-stack\\//, '').replaceAll('/', '-'); }" };
  const accepted = isAcceptableDoc(reply, target, false);
  assert.ok(accepted !== null);
  assert.ok(!accepted.includes("@function"));
  assert.ok(accepted.includes("Strips the package prefix"));
}

// Test 2: Mismatched @function echo -> rejected
{
  const reply = `/**
 * @function collectMountablePackageNames
 * Scans directories for package manifests.
 */`;
  const target = { name: "rowIdFor", params: ["packageName"], code: "function rowIdFor(packageName) {}" };
  const accepted = isAcceptableDoc(reply, target, false);
  assert.strictEqual(accepted, null, "Should reject mismatched @function echo");
}

// Test 3: Documented params on zero-param function -> rejected
{
  const reply = `/**
 * @function handle
 * Handles registration of providers.
 * @param {string} _ns - The namespace.
 */`;
  const target = { name: "handle", params: [], code: "const handle = () => {};" };
  const accepted = isAcceptableDoc(reply, target, false);
  assert.strictEqual(accepted, null, "Should reject @param on 0-param function");
}

// Test 4: Documented param not in function signature -> rejected
{
  const reply = `/**
 * @function processFile
 * Reads and transforms a file.
 * @param {string} dir - The directory.
 */`;
  const target = { name: "processFile", params: ["filePath", "content"], code: "function processFile(filePath, content) {}" };
  const accepted = isAcceptableDoc(reply, target, false);
  assert.strictEqual(accepted, null, "Should reject @param not in signature");
}

// Test 5: @throws without throw in code -> rejected
{
  const reply = `/**
 * @function clampValue
 * Clamps value to maximum.
 * @throws {Error} If value is negative.
 */`;
  const target = { name: "clampValue", params: ["val"], code: "function clampValue(val) { return Math.max(0, val); }" };
  const accepted = isAcceptableDoc(reply, target, false);
  assert.strictEqual(accepted, null, "Should reject @throws when code does not throw");
}

// Test 6: @throws with throw in code -> accepted
{
  const reply = `/**
 * @function parsePort
 * Parses the port number from environment.
 * @throws If the port is out of range.
 */`;
  const target = { name: "parsePort", params: ["val"], code: "function parsePort(val) { if (val < 0) throw new Error('invalid'); return val; }" };
  const accepted = isAcceptableDoc(reply, target, false);
  assert.ok(accepted !== null, "Should accept @throws when code throws");
}

// Test 7: TypeScript {type} annotations in TS mode -> rejected
{
  const reply = `/**
 * @function transform
 * Transforms input string.
 * @param {string} input - Input value.
 */`;
  const target = { name: "transform", params: ["input"], code: "function transform(input: string): string {}" };
  const accepted = isAcceptableDoc(reply, target, true);
  assert.strictEqual(accepted, null, "Should reject {type} in TypeScript mode");
}

// Test 8: Deduplication across different functions
{
  const reply1 = `/**
 * @function foo
 * Returns the current active configuration object from memory.
 */`;
  const reply2 = `/**
 * @function bar
 * Returns the current active configuration object from memory.
 */`;
  const seen = new Set();
  const acc1 = isAcceptableDoc(reply1, { name: "foo", params: [], code: "" }, false, seen);
  assert.ok(acc1 !== null);
  const acc2 = isAcceptableDoc(reply2, { name: "bar", params: [], code: "" }, false, seen);
  assert.strictEqual(acc2, null, "Should reject duplicate description for a different function");
}

console.log("All isAcceptableDoc tests passed successfully!");
