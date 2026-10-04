/**
 * Shared fixtures for dialect extensions' `test.mjs` protocol-contract tests.
 * Centralized here instead of hand-copied per package, the same way
 * `plugin-check-kit.mjs` centralizes shared `check-plugin.mjs` assertions.
 */

/**
 * Build a minimal user-role harness message carrying one text block.
 *
 * @param {string} text - the message text.
 * @returns {Record<string, unknown>} a harness message.
 */
export function userMessage(text) {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  };
}

/**
 * Collect every element an async generator yields into an array.
 *
 * @param {AsyncGenerator<unknown>} gen - the generator to drain.
 * @returns {Promise<unknown[]>} the yielded elements, in order.
 */
export async function collect(gen) {
  const out = [];
  for await (const c of gen) out.push(c);
  return out;
}

/**
 * Log a one-line "ok - <name>" progress marker.
 *
 * @param {string} name - the assertion group that just passed.
 */
export function ok(name) {
  console.log("ok -", name);
}
