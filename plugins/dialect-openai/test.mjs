import assert from "node:assert/strict";
import { openaiDialect } from "./lib/openai.js";
import { translateOpenAi } from "./lib/translate-openai.js";
import { userMessage, collect, ok } from "../../scripts/dialect-test-kit.mjs";

// ---- openai: serialize shape ----
const req = openaiDialect.serialize(
  {
    provider: "p",
    model: "deepseek",
    system: "be brief",
    messages: [userMessage("hi")],
    tools: [{ name: "t", description: "a", parameters: { type: "object" } }],
    temperature: 0.3,
    maxTokens: 64,
    stop: ["END"],
  },
  { apiKey: "k" },
  "https://api.kimi.com/coding/v1",
  { maxTokens: 128 },
);
assert.equal(req.url, "https://api.kimi.com/coding/v1/chat/completions");
assert.equal(req.framing, "sse");
assert.equal(req.headers.authorization, "Bearer k");
const body = JSON.parse(req.body);
assert.equal(body.system, undefined);
assert.equal(body.messages[0].role, "system");
assert.equal(body.messages[0].content, "be brief");
assert.equal(body.messages[1].content, "hi");
assert.equal(body.tools[0].function.name, "t");
assert.equal(body.stream, true);
assert.equal(body.max_tokens, 64);
assert.deepEqual(body.stop, ["END"]);
let authErr;
try {
  openaiDialect.serialize({ provider: "p", model: "m", messages: [] }, {}, "https://x", {
    maxTokens: 1,
  });
} catch (e) {
  authErr = e;
}
assert.equal(authErr.code, "AUTH");
ok("openai serialize");

// ---- openai: translate with reasoning + tool calls + disjoint usage ----
const sse = [
  { choices: [{ delta: { reasoning_content: "think" } }] },
  { choices: [{ delta: { content: "Hello" } }] },
  {
    choices: [
      {
        delta: {
          tool_calls: [{ index: 0, id: "call_1", function: { name: "search", arguments: "" } }],
        },
      },
    ],
  },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":' } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] } }] },
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  {
    usage: { prompt_tokens: 12, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 5 } },
  },
];
const payloads = [...sse.map((c) => JSON.stringify(c)), "[DONE]"];
const chunks = await collect(translateOpenAi(payloads));
const types = chunks.map((c) => c.type);
assert.deepEqual(types, [
  "block-start",
  "reasoning-delta",
  "block-start",
  "text-delta",
  "block-start",
  "tool-call-delta",
  "tool-call-delta",
  "tool-call-delta",
  "block-end",
  "block-end",
  "block-end",
  "usage",
  "finish",
]);
const usage = chunks.find((c) => c.type === "usage").usage;
assert.equal(usage.inputTokens, 7);
assert.equal(usage.cacheReadTokens, 5);
assert.equal(usage.outputTokens, 3);
const finish = chunks.at(-1);
assert.equal(finish.reason.kind, "tool-calls");
const toolBlock = chunks.find((c) => c.type === "block-end" && c.block.type === "tool-call").block;
assert.equal(toolBlock.name, "search");
assert.equal(toolBlock.arguments, '{"q":"x"}');
ok("openai translate contract");

// ---- openai: EMPTY_RESPONSE ----
const empty = await collect(translateOpenAi(["[DONE]"]));
assert.equal(empty.at(-1).reason.kind, "error");
assert.equal(empty.at(-1).reason.failure.code, "EMPTY_RESPONSE");
ok("openai empty response");

console.log("\ndialect-openai protocol tests passed");
