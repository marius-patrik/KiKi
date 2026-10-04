import assert from "node:assert";
import { extractFunctionContext } from "./extract-function-context.mjs";

console.log("Testing extractFunctionContext...");

// Test 1: Standard function declaration with parameters
{
  const source = `
/** foo implementation. */
function foo(a, b) {
  return a + b;
}
`;
  const matchIndex = source.indexOf("/** foo implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** foo implementation. */".length);
  assert.strictEqual(extracted.name, "foo");
  assert.deepStrictEqual(extracted.params, ["a", "b"]);
  assert.strictEqual(extracted.isAsync, false);
  assert.strictEqual(extracted.isGenerator, false);
  assert.strictEqual(extracted.code, `function foo(a, b) {\n  return a + b;\n}`);
}

// Test 2: Async generator function
{
  const source = `
/** walk implementation. */
async function* walk(dir) {
  yield dir;
}
`;
  const matchIndex = source.indexOf("/** walk implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** walk implementation. */".length);
  assert.strictEqual(extracted.name, "walk");
  assert.deepStrictEqual(extracted.params, ["dir"]);
  assert.strictEqual(extracted.isAsync, true);
  assert.strictEqual(extracted.isGenerator, true);
}

// Test 3: Arrow function assigned to const
{
  const source = `
/** run implementation. */
const run = (child, timeout = 1000) => {
  return child.run();
};
`;
  const matchIndex = source.indexOf("/** run implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** run implementation. */".length);
  assert.strictEqual(extracted.name, "run");
  assert.deepStrictEqual(extracted.params, ["child", "timeout"]);
}

// Test 4: Wedged comment between const and identifier
{
  const source = `
const /** run implementation. */
  run = (child) => child.id;
`;
  const matchIndex = source.indexOf("/** run implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** run implementation. */".length);
  assert.strictEqual(extracted.name, "run");
  assert.deepStrictEqual(extracted.params, ["child"]);
}

// Test 5: Object method declaration
{
  const source = `
const obj = {
  /** handle implementation. */
  handle(req, res) {
    res.end();
  }
};
`;
  const matchIndex = source.indexOf("/** handle implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** handle implementation. */".length);
  assert.strictEqual(extracted.name, "handle");
  assert.deepStrictEqual(extracted.params, ["req", "res"]);
}

// Test 6: Zero parameter function
{
  const source = `
/** noop implementation. */
function noop() {}
`;
  const matchIndex = source.indexOf("/** noop implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** noop implementation. */".length);
  assert.strictEqual(extracted.name, "noop");
  assert.deepStrictEqual(extracted.params, []);
}

// Test 7: Destructuring parameters
{
  const source = `
/** processOptions implementation. */
function processOptions({ timeout, retries }, [first, ...rest]) {
  return timeout;
}
`;
  const matchIndex = source.indexOf("/** processOptions implementation. */");
  const extracted = extractFunctionContext(source, matchIndex, "/** processOptions implementation. */".length);
  assert.strictEqual(extracted.name, "processOptions");
  assert.deepStrictEqual(extracted.params, ["timeout", "retries", "first", "rest"]);
}

console.log("All extractFunctionContext tests passed successfully!");
