import assert from "node:assert/strict";
import { codeAssistDialect } from "./lib/code-assist.js";

// The code-assist dialect nests the vertex request under `request` and takes
// an OAuth bearer token against the v1internal service root.
assert.throws(
  () =>
    codeAssistDialect.serialize(
      { provider: "p", model: "m", messages: [] },
      {},
      "https://cloudcode-pa.googleapis.com/v1internal",
      { maxTokens: 10 },
    ),
  /bearer token/,
);
const assistRequest = codeAssistDialect.serialize(
  {
    provider: "p",
    model: "gemini-3.6-flash",
    system: "be terse",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  },
  { token: "t" },
  "https://cloudcode-pa.googleapis.com/v1internal",
  { maxTokens: 10 },
);
assert.equal(
  assistRequest.url,
  "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
);
assert.equal(assistRequest.framing, "sse");
assert.equal(assistRequest.headers.authorization, "Bearer t");
const wrapped = JSON.parse(assistRequest.body);
assert.equal(wrapped.model, "gemini-3.6-flash");
assert.equal(wrapped.project, "");
assert.ok(typeof wrapped.user_prompt_id === "string" && wrapped.user_prompt_id.length === 36);
assert.deepEqual(wrapped.request.contents, [{ role: "user", parts: [{ text: "hi" }] }]);
assert.equal(wrapped.request.systemInstruction.parts[0].text, "be terse");
assert.ok(
  typeof wrapped.request.session_id === "string" && wrapped.request.session_id.length === 36,
);

console.log("ok - code-assist serialize:", assistRequest.url);
console.log("\ndialect-code-assist protocol tests passed");
