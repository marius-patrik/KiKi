import assert from "node:assert/strict";
import { claudeDialect } from "./lib/claude.js";
import { translateClaude } from "./lib/translate-claude.js";
import { userMessage, collect, ok } from "../../../scripts/dialect-test-kit.mjs";

// ---- claude: serialize ----
const creq = claudeDialect.serialize(
  { provider: "p", model: "sonnet", messages: [userMessage("hi")] },
  { token: "t" },
  "https://api.anthropic.com/v1",
  { maxTokens: 100 },
);
assert.equal(creq.url, "https://api.anthropic.com/v1/messages");
assert.equal(creq.headers["anthropic-version"], "2023-06-01");
assert.equal(creq.headers.authorization, "Bearer t");
const cbody = JSON.parse(creq.body);
assert.equal(cbody.max_tokens, 100);
assert.equal(cbody.stream, true);
assert.equal(cbody.messages[0].role, "user");
assert.equal(cbody.messages[0].content[0].text, "hi");
assert.equal(creq.framing, "sse");
ok("claude serialize");

// Anthropic's OAuth subscription endpoint checks that the request identifies
// as Claude Code. Without the leading system block it refuses Opus and Sonnet
// with a rate_limit_error whose message is literally "Error", while the
// account's 5h utilization sits at 0.43. API-key requests must not carry it.
{
  const base = {
    model: "claude-opus-5",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  };
  const defaults = { maxTokens: 1024 };

  const oauth = claudeDialect.serialize(
    base,
    { token: "oauth-token" },
    "https://api.anthropic.com/v1",
    defaults,
  );
  const oauthBody = JSON.parse(oauth.body);
  assert.deepEqual(oauthBody.system, [
    {
      type: "text",
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
      cache_control: { type: "ephemeral" },
    },
  ]);

  // The caller's own prompt is kept, after the identity, never dropped.
  const withSystem = claudeDialect.serialize(
    { ...base, system: "Be terse." },
    { token: "oauth-token" },
    "https://api.anthropic.com/v1",
    defaults,
  );
  assert.deepEqual(JSON.parse(withSystem.body).system, [
    {
      type: "text",
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: "Be terse.", cache_control: { type: "ephemeral" } },
  ]);

  // An API key gets no injected identity.
  assert.equal(
    JSON.parse(
      claudeDialect.serialize(base, { apiKey: "sk-test" }, "https://api.anthropic.com/v1", defaults)
        .body,
    ).system,
    undefined,
  );
  assert.equal(
    JSON.parse(
      claudeDialect.serialize(
        { ...base, system: "Be terse." },
        { apiKey: "sk-test" },
        "https://api.anthropic.com/v1",
        defaults,
      ).body,
    ).system,
    "Be terse.",
  );
  ok("claude oauth identity system block");
}

// ---- claude: translate tool_use + usage + finish, message_id replay ----
const events = [
  {
    event: "message_start",
    data: JSON.stringify({
      type: "message_start",
      message: { id: "msg_1", usage: { input_tokens: 8 } },
    }),
  },
  {
    event: "content_block_start",
    data: JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "tu_1", name: "search", input: {} },
    }),
  },
  {
    event: "content_block_delta",
    data: JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"q":' },
    }),
  },
  {
    event: "content_block_delta",
    data: JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '"x"}' },
    }),
  },
  { event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
  {
    event: "message_delta",
    data: JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: 3 },
    }),
  },
  { event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
];
const cchunks = await collect(translateClaude(events));
const ctypes = cchunks.map((c) => c.type);
assert.deepEqual(ctypes, [
  "block-start",
  "tool-call-delta",
  "tool-call-delta",
  "tool-call-delta",
  "block-end",
  "usage",
  "finish",
]);
const cusage = cchunks.find((c) => c.type === "usage").usage;
assert.equal(cusage.inputTokens, 8);
assert.equal(cusage.outputTokens, 3);
const cfin = cchunks.at(-1);
assert.equal(cfin.reason.kind, "tool-calls");
assert.deepEqual(cfin.replayState, { response: { messageId: "msg_1" } });
const ctool = cchunks.find((c) => c.type === "block-end").block;
assert.equal(ctool.name, "search");
assert.equal(ctool.arguments, '{"q":"x"}');
ok("claude translate contract");

console.log("\ndialect-claude protocol tests passed");
