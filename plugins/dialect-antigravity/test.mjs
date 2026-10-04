import assert from "node:assert/strict";
import { antigravityDialect, ANTIGRAVITY_PROJECT_HEADER } from "./lib/antigravity.js";

// --- antigravity: the subscription transport, not the Code Assist one ---
const auth = { token: "tok", headers: { [ANTIGRAVITY_PROJECT_HEADER]: "iron-courage-jc5ww" } };
const opts = {
  model: "default",
  system: "Be terse.",
  messages: [
    { role: "user", content: [{ type: "text", text: "first" }] },
    { role: "assistant", content: [{ type: "text", text: "answer" }] },
    { role: "user", content: [{ type: "text", text: "second" }] },
  ],
};
const req = antigravityDialect.serialize(
  opts,
  auth,
  "https://cloudcode-pa.googleapis.com/v1internal",
  {
    maxTokens: 64,
  },
);
// The method is what separates the subscription pool from the free tier.
assert.equal(req.url, "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateChat");
const body = JSON.parse(req.body);
// A bare project id: the "projects/<id>" form is refused as an IAM path.
assert.equal(body.project, "iron-courage-jc5ww");
assert.equal(body.userMessage, "second");
assert.deepEqual(body.history, [
  { content: "Be terse." },
  { content: "first" },
  { content: "answer" },
]);
// The project is credential material, not something to leak onto the wire.
assert.equal(req.headers[ANTIGRAVITY_PROJECT_HEADER], undefined);
assert.equal(req.headers["user-agent"], "Antigravity/2.0.1 (Jetbrains; DARWIN_ARM64)");
// modelConfigId stays absent: every published id is refused, and omitting it
// serves the account default on the paid tier.
assert.equal(body.modelConfigId, undefined);

assert.throws(
  () =>
    antigravityDialect.serialize(opts, { token: "tok" }, "https://x/v1internal", {
      maxTokens: 64,
    }),
  /ANTIGRAVITY_PROJECT/,
);
assert.throws(
  () =>
    antigravityDialect.serialize(opts, { headers: auth.headers }, "https://x/v1internal", {
      maxTokens: 64,
    }),
  /no bearer token/,
);
assert.throws(
  () =>
    antigravityDialect.serialize(
      {
        model: "m",
        messages: [{ role: "assistant", content: [{ type: "text", text: "a" }] }],
      },
      auth,
      "https://cloudcode-pa.googleapis.com/v1internal",
      { maxTokens: 64 },
    ),
  /trailing user message/,
);

const wire = JSON.stringify([
  { markdown: "wor" },
  { markdown: "king", usageMetadata: { candidatesTokenCount: "2", totalTokenCount: "10" } },
]);
const stream = new ReadableStream({
  /** Enqueues the whole wire payload and closes. */
  start(c) {
    c.enqueue(new TextEncoder().encode(wire));
    c.close();
  },
});
const chunks = [];
for await (const chunk of antigravityDialect.parse(stream)) chunks.push(chunk);
assert.equal(
  chunks
    .filter((c) => c.type === "text-delta")
    .map((c) => c.text)
    .join(""),
  "working",
);
const usage = chunks.find((c) => c.type === "usage");
assert.deepEqual(usage.usage, { inputTokens: 8, outputTokens: 2 });
assert.equal(chunks.at(-1).reason.kind, "stop");

// An empty answer is an error finish, not a silent success.
const empty = new ReadableStream({
  /** Enqueues an empty JSON array and closes. */
  start(c) {
    c.enqueue(new TextEncoder().encode("[]"));
    c.close();
  },
});
const emptyChunks = [];
for await (const chunk of antigravityDialect.parse(empty)) emptyChunks.push(chunk);
assert.equal(emptyChunks.at(-1).reason.kind, "error");

console.log("ok - antigravity dialect");
console.log("\ndialect-antigravity protocol tests passed");
