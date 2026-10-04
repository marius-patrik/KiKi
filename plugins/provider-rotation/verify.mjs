import assert from "node:assert/strict";
import { apply, name, inject, PoolAdapter } from "./lib/index.js";
import { LlmError } from "@deepseek-ai/dsh-llm";

assert.equal(name, "provider-rotation");
assert.deepEqual(inject, ["llm"]);

/** A minimal fake ctx.llm: registerAdapter records what was registered; listProviders returns a fixed list; stream is provided per test. */
function fakeCtx({ providers, streamImpl }) {
  const registered = [];
  const listeners = new Map();
  return {
    llm: {
      listProviders: () => providers.map((id) => ({ id, name: id })),
      registerAdapter: (ids, adapter) => {
        registered.push({ ids, adapter });
      },
      stream: streamImpl,
    },
    logger: { info: () => {}, warn: () => {} },
    effect: (fn) => fn(),
    on: (event, fn) => {
      listeners.set(event, fn);
      return () => listeners.delete(event);
    },
    registered,
  };
}

// ---- apply() pools a 2+-account vendor, skips a single-account one ----
{
  const ctx = fakeCtx({
    providers: ["openrouter", "openrouter-2", "openrouter-3", "z-ai", "solo-provider"],
    streamImpl: async function* () {},
  });
  apply(ctx);
  const poolIds = ctx.registered.map((r) => r.ids[0]);
  assert.deepEqual(poolIds.sort(), ["openrouter-pool"]);
  const [{ adapter }] = ctx.registered;
  assert.ok(adapter instanceof PoolAdapter);
  console.log("ok - apply() registers a pool only for vendors with 2+ accounts");
}

/** Drains an async iterable into an array. */
async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

/** An async generator factory that immediately throws an LlmError -- a stand-in for an adapter that rejects instead of yielding an error `finish` chunk. */
function throwing(message, code) {
  return async function* () {
    throw new LlmError(message, code);
  };
}

/** An async generator factory yielding one real content chunk then a clean stop -- a stand-in for a sibling account that succeeds after rotation. */
async function* textThenStop() {
  yield { type: "text-delta", index: 0, text: "ok" };
  yield { type: "finish", reason: { kind: "stop" } };
}

/**
 * A `ctx.llm.stream` that records each requested provider into the returned
 * `attempts` array and dispatches to `perProvider[provider]` (falling back to
 * `perProvider.default`), factoring out the attempt-tracking dispatch every
 * `PoolAdapter` test below needs.
 */
function trackedStream(perProvider) {
  const attempts = [];
  /** Records the requested provider, then dispatches to its configured generator factory. */
  const stream = ({ provider }) => {
    attempts.push(provider);
    return (perProvider[provider] ?? perProvider.default)();
  };
  return { attempts, stream };
}

/** Runs a `PoolAdapter` over `members` against a `trackedStream(perProvider)` and returns `{ attempts, chunks }` (or rejects, for a caller using `assert.rejects`). */
function runPool(members, perProvider) {
  const { attempts, stream } = trackedStream(perProvider);
  const ctx = { llm: { stream }, logger: { warn: () => {} } };
  const adapter = new PoolAdapter(ctx, members);
  const chunks = collect(
    adapter.stream({ provider: `${members[0]}-pool`, model: "m", messages: [] }),
  );
  return { attempts, chunks };
}

/** Asserts a `runPool()` result rotated through exactly `expectedAttempts` and completed with a trailing text-delta + finish. */
async function assertRotatedToCompletion({ attempts, chunks }, expectedAttempts, message) {
  assert.deepEqual(
    (await chunks).map((c) => c.type),
    ["text-delta", "finish"],
  );
  assert.deepEqual(attempts, expectedAttempts);
  console.log(`ok - ${message}`);
}

// ---- PoolAdapter rotates to the next member on QUOTA before any yield ----
{
  const result = runPool(["openrouter", "openrouter-2"], {
    openrouter: throwing("exhausted", "QUOTA"),
    default: textThenStop,
  });
  await assertRotatedToCompletion(
    result,
    ["openrouter", "openrouter-2"],
    "PoolAdapter rotates to the next member on QUOTA and completes",
  );
}

// ---- PoolAdapter throws the last member's error once every member is exhausted ----
{
  const { chunks } = runPool(["openrouter", "openrouter-2"], {
    default: throwing("rate limited", "RATE_LIMIT"),
  });
  await assert.rejects(
    () => chunks,
    (error) => error instanceof LlmError && error.code === "RATE_LIMIT",
  );
  console.log("ok - throws once every pool member is exhausted");
}

// ---- PoolAdapter never rotates on a non-rotatable error code ----
{
  const { attempts, chunks } = runPool(["openrouter", "openrouter-2"], {
    default: throwing("bad request", "INVALID_REQUEST"),
  });
  await assert.rejects(
    () => chunks,
    (error) => error instanceof LlmError && error.code === "INVALID_REQUEST",
  );
  assert.deepEqual(attempts, ["openrouter"]);
  console.log("ok - never rotates on a non-rotatable error code");
}

// ---- rotates on an unclassified pi-ai PI_AI_ERROR whose message is a known OpenRouter quota wording ----
{
  const { attempts, chunks } = runPool(["openrouter", "openrouter-2"], {
    openrouter: throwing("This request requires more credits, or fewer max_tokens.", "PI_AI_ERROR"),
    default: async function* () {
      yield { type: "finish", reason: { kind: "stop" } };
    },
  });
  assert.equal((await chunks).length, 1);
  assert.deepEqual(attempts, ["openrouter", "openrouter-2"]);
  console.log(
    "ok - rotates on an unclassified PI_AI_ERROR matching a known OpenRouter quota wording",
  );
}

// ---- does not rotate on PI_AI_ERROR with an unrelated message ----
{
  const { attempts, chunks } = runPool(["openrouter", "openrouter-2"], {
    default: throwing("stream ended before message_stop", "PI_AI_ERROR"),
  });
  await assert.rejects(
    () => chunks,
    (error) => error instanceof LlmError && error.code === "PI_AI_ERROR",
  );
  assert.deepEqual(attempts, ["openrouter"]);
  console.log("ok - does not rotate on a PI_AI_ERROR with an unrelated message");
}

// ---- rotates on a failure signaled via a `finish` chunk (not a throw), discarding buffered scaffolding chunks ----
// LlmRuntime normally converts a caught adapter error into a terminal `finish`
// chunk with an error/aborted reason instead of rejecting the iteration (see
// adapterFailureChunk in harness's llm package) -- confirmed live against a
// real exhausted account, where a `usage` chunk arrived before the failing
// finish chunk on every failed attempt. A naive "anything yielded means real
// output" check treats that scaffolding chunk as content and wrongly refuses
// to rotate; this pins the fix.
{
  const result = runPool(["openrouter", "openrouter-2"], {
    openrouter: async function* () {
      yield { type: "usage", usage: { inputTokens: 5, outputTokens: 0 } };
      yield {
        type: "finish",
        reason: { kind: "error", failure: { code: "QUOTA", message: "exhausted" } },
      };
    },
    default: textThenStop,
  });
  await assertRotatedToCompletion(
    result,
    ["openrouter", "openrouter-2"],
    "rotates on a finish/error chunk, discarding buffered scaffolding from the failed attempt",
  );
}

// ---- forwards buffered scaffolding chunks when the failure is not rotated away ----
{
  const { chunks } = runPool(["openrouter"], {
    default: async function* () {
      yield { type: "usage", usage: { inputTokens: 5, outputTokens: 0 } };
      yield {
        type: "finish",
        reason: { kind: "error", failure: { code: "INVALID_REQUEST", message: "bad model" } },
      };
    },
  });
  const resolved = await chunks;
  assert.deepEqual(
    resolved.map((c) => c.type),
    ["usage", "finish"],
  );
  assert.equal(resolved[1].reason.failure.code, "INVALID_REQUEST");
  console.log("ok - forwards buffered scaffolding and the failure chunk when it does not rotate");
}

console.log("Provider rotation verification passed.");
