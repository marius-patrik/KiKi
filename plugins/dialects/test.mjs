import assert from "node:assert/strict";
import { DialectRegistry, DONE, parseSseData, parseSseEvents, parseNdjson } from "./lib/index.js";
import { Context } from "@deepseek-ai/cordis";

/** Logs "ok -" followed by the provided name to the console. */
const ok = (name) => {
  console.log("ok -", name);
};

/** Wraps a string as a byte `ReadableStream`, the shape every framing helper reads. */
function streamOf(text) {
  return new ReadableStream({
    /** Enqueues the whole payload and closes. */
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

/** Collects an async generator into an array. */
async function collect(gen) {
  const out = [];
  for await (const v of gen) out.push(v);
  return out;
}

// ---- registry: register/unregister/get/list ----
{
  const ctx = new Context();
  const registry = new DialectRegistry(ctx);
  assert.deepEqual(registry.list(), []);
  const stub = { id: "stub", serialize: () => {}, parse: async function* () {} };
  registry.register(stub);
  assert.equal(registry.get("stub"), stub);
  assert.deepEqual(
    registry.list().map((d) => d.id),
    ["stub"],
  );
  assert.throws(() => registry.register(stub), /duplicate dialect "stub"/);
  assert.throws(() => registry.get("missing"), /unknown dialect "missing"/);
  registry.unregister("stub");
  assert.deepEqual(registry.list(), []);
  ok("dialect registry register/unregister/get/list");
}

// ---- sse framing helpers ----
{
  assert.equal(DONE, "[DONE]");
  const events = await collect(parseSseEvents(streamOf('event: message\ndata: {"a":1}\n\n')));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "message");
  assert.equal(events[0].data, '{"a":1}');

  const payloads = await collect(parseSseData(streamOf('data: {"a":1}\n\ndata: [DONE]\n\n')));
  assert.deepEqual(payloads, ['{"a":1}', "[DONE]"]);
  await assert.rejects(
    () => collect(parseSseData(streamOf('data: {"a":1}\n\n'))),
    /STREAM_CLOSED|ended without \[DONE\]/,
  );
  ok("sse framing helpers");
}

// ---- ndjson framing helper ----
{
  const lines = await collect(parseNdjson(streamOf('{"a":1}\n{"b":2}\n')));
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  ok("ndjson framing helper");
}

console.log("\ndialects registry tests passed");
