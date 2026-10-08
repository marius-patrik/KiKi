import assert from "node:assert/strict";
import { DialectAdapter, httpErrorCode } from "./lib/adapter.js";
import { LlmError } from "@deepseek-ai/dsh-llm";

/** Logs "ok -" followed by the provided name to the console. */
const ok = (name) => console.log("ok -", name);

// ---- httpErrorCode classifies 402 as quota exhaustion, unconditionally ----
{
  assert.equal(httpErrorCode(402, undefined), "QUOTA");
  assert.equal(httpErrorCode(402, "This request requires more credits"), "QUOTA");
  ok("httpErrorCode(402, ...) is QUOTA regardless of message wording");
}

const RETRY_POLICY = Object.freeze({
  mode: "normal",
  maxRetries: 0,
  retryableCodes: [],
  initialDelayMs: 0,
  maxDelayMs: 0,
  jitterRatio: 0,
});

/** A minimal ProviderConnection for one fake account, keyed by its own URL. */
function connectionFor(provider) {
  return {
    displayName: provider,
    dialectId: "test-dialect",
    baseURL: `https://example.test/${provider}`,
    authSlots: [],
    models: [],
    defaultMaxTokens: 100,
    defaultContextWindow: 1000,
    streamIdleTimeoutMs: 5000,
    retryPolicy: RETRY_POLICY,
  };
}

/** A dialect stub that serializes to a fixed body and parses one text-delta + finish. */
const dialect = {
  id: "test-dialect",
  serialize: (_options, _auth, baseURL) => ({
    url: baseURL,
    method: "POST",
    headers: {},
    body: "{}",
    framing: "sse",
  }),
  /** Always yields the same fixed one-chunk-then-finish response, ignoring the actual body. */
  async *parse() {
    yield { type: "text-delta", index: 0, text: "ok" };
    yield { type: "finish", reason: "stop" };
  },
};

/** Builds a fetch stub answering each configured account's URL with a fixed status. */
function fetchStub(responsesByProvider) {
  return async (url) => {
    const provider = String(url).split("/").pop();
    const status = responsesByProvider[provider];
    if (status === 200) {
      return new Response(new ReadableStream(), { status: 200 });
    }
    return new Response(JSON.stringify({ message: `stub ${status} for ${provider}` }), {
      status,
    });
  };
}

/** Constructs a DialectAdapter over a stubbed global fetch; call `restore()` when done. */
function makeAdapter({ responsesByProvider, rotationSiblings, onRotate }) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub(responsesByProvider);
  const adapter = new DialectAdapter({
    getDialect: () => dialect,
    options: connectionFor,
    resolveAuth: async () => ({ kind: "apiKey", value: "test" }),
    gate: async () => undefined,
    resolveUserId: () => "test-user",
    rotationSiblings,
    onRotate,
  });
  return { adapter, restore: () => (globalThis.fetch = originalFetch) };
}

/** Drains an async iterable into an array. */
async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

// ---- rotates to a sibling on QUOTA and succeeds ----
{
  const rotations = [];
  const { adapter, restore } = makeAdapter({
    responsesByProvider: { "acct-1": 402, "acct-2": 200 },
    rotationSiblings: (p) => (p === "acct-1" ? ["acct-2"] : []),
    onRotate: (from, to, code) => rotations.push([from, to, code]),
  });
  try {
    const chunks = await collect(adapter.stream({ provider: "acct-1", model: "m", messages: [] }));
    assert.deepEqual(
      chunks.map((c) => c.type),
      ["text-delta", "finish"],
    );
    assert.deepEqual(rotations, [["acct-1", "acct-2", "QUOTA"]]);
    ok("rotates to a sibling account on QUOTA and completes the stream");
  } finally {
    restore();
  }
}

// ---- exhausts every sibling and throws the last error, not the first ----
{
  const { adapter, restore } = makeAdapter({
    responsesByProvider: { "acct-1": 402, "acct-2": 429 },
    rotationSiblings: (p) => (p === "acct-1" ? ["acct-2"] : []),
    onRotate: () => {},
  });
  try {
    await assert.rejects(
      () => collect(adapter.stream({ provider: "acct-1", model: "m", messages: [] })),
      (error) => {
        assert.ok(error instanceof LlmError);
        assert.equal(error.code, "RATE_LIMIT");
        return true;
      },
    );
    ok("throws the last sibling's error once every account is exhausted");
  } finally {
    restore();
  }
}

// ---- no rotationSiblings configured: fails straight through ----
{
  const { adapter, restore } = makeAdapter({
    responsesByProvider: { "acct-1": 402 },
    rotationSiblings: undefined,
    onRotate: () => assert.fail("onRotate must not fire with no siblings"),
  });
  try {
    await assert.rejects(
      () => collect(adapter.stream({ provider: "acct-1", model: "m", messages: [] })),
      (error) => error instanceof LlmError && error.code === "QUOTA",
    );
    ok("never rotates when no sibling accounts are configured");
  } finally {
    restore();
  }
}

console.log("Provider adapter rotation tests passed.");
