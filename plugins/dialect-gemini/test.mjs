import assert from "node:assert/strict";
import { geminiDialect } from "./lib/gemini.js";
import { translateGemini } from "./lib/translate-gemini.js";
import { userMessage, collect, ok } from "../../scripts/dialect-test-kit.mjs";

// ---- gemini: serialize ----
const greq = geminiDialect.serialize(
  { provider: "p", model: "gemini-2.5", messages: [userMessage("hi")] },
  { cookies: { "__Secure-1PSID": "a", SNlM0e: "b" } },
  "https://x/gemini-dispatch/streamGenerateContent?alt=sse",
  { maxTokens: 64 },
);
assert.equal(greq.framing, "ndjson");
assert.equal(greq.url, "https://x/gemini-dispatch/streamGenerateContent?alt=sse");
assert.equal(greq.headers.cookie, "__Secure-1PSID=a; SNlM0e=b");
const gbody = JSON.parse(greq.body);
assert.equal(gbody.contents[0].role, "user");
assert.equal(gbody.contents[0].parts[0].text, "hi");
assert.equal(gbody.generationConfig.maxOutputTokens, 64);
ok("gemini serialize");

// ---- gemini: translate cumulative text + functionCall ----
const glines = [
  { candidates: [{ content: { parts: [{ text: "Hello" }] } }] },
  { candidates: [{ content: { parts: [{ text: "Hello world" }] } }] },
  {
    candidates: [
      {
        content: {
          parts: [{ text: "Hello world" }, { functionCall: { name: "search", args: { q: "x" } } }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: "Hello world" }, { functionCall: { name: "search", args: { q: "x" } } }],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
  },
];
const gchunks = await collect(translateGemini(glines.map((l) => JSON.stringify(l))));
const gtypes = gchunks.map((c) => c.type);
assert.deepEqual(gtypes, [
  "block-start",
  "text-delta",
  "text-delta",
  "block-start",
  "tool-call-delta",
  "block-end",
  "block-end",
  "usage",
  "finish",
]);
const gusage = gchunks.find((c) => c.type === "usage").usage;
assert.equal(gusage.inputTokens, 4);
assert.equal(gusage.outputTokens, 2);
const gfin = gchunks.at(-1);
assert.equal(gfin.reason.kind, "stop");
const gtools = gchunks.filter((c) => c.type === "block-end").map((c) => c.block);
assert.equal(gtools[0].type, "text");
assert.equal(gtools[0].text, "Hello world");
assert.equal(gtools[1].type, "tool-call");
assert.equal(gtools[1].name, "search");
assert.equal(gtools[1].arguments, '{"q":"x"}');
ok("gemini translate contract");

// ---- gemini: no content -> EMPTY_RESPONSE ----
const gem = await collect(translateGemini(['{"candidates":[{"content":{"parts":[]}}]}']));
assert.equal(gem.at(-1).reason.kind, "error");
assert.equal(gem.at(-1).reason.failure.code, "EMPTY_RESPONSE");
ok("gemini empty response");

// ---- claude tool-result name mapping in gemini serialize ----
const toolCallMsg = {
  id: crypto.randomUUID(),
  role: "assistant",
  content: [{ type: "tool-call", id: "call_9", name: "search", arguments: '{"q":"x"}' }],
  source: { kind: "model", provider: "p", model: "m" },
};
const toolResultMsg = {
  id: crypto.randomUUID(),
  role: "tool",
  toolCallId: "call_9",
  content: [{ type: "text", text: "r1" }],
  source: { kind: "tool", callId: "call_9" },
};
const grt = geminiDialect.serialize(
  { provider: "p", model: "g", messages: [userMessage("q"), toolCallMsg, toolResultMsg] },
  { cookies: { x: "y" } },
  "https://x:streamGenerateContent",
  { maxTokens: 10 },
);
assert.equal(grt.url, "https://x:streamGenerateContent?alt=sse");
const rbody = JSON.parse(grt.body);
assert.equal(rbody.contents[1].role, "model");
assert.equal(rbody.contents[1].parts[0].functionCall.name, "search");
assert.equal(rbody.contents[2].role, "user");
assert.equal(rbody.contents[2].parts[0].functionResponse.name, "search");
assert.deepEqual(rbody.contents[2].parts[0].functionResponse.response, { result: "r1" });
ok("gemini tool round-trip serialize");

console.log("\ndialect-gemini protocol tests passed");
