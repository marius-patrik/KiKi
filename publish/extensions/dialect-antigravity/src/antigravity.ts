/**
 * The Antigravity subscription dialect.
 *
 * Antigravity and the Gemini CLI both talk to `cloudcode-pa.googleapis.com`,
 * but they are different products on different quotas. The Gemini CLI calls
 * `:streamGenerateContent`, which bills the free Code Assist tier; Antigravity
 * chat calls `:streamGenerateChat`, which bills the Antigravity subscription
 * pool. Sending the first method with a subscription token yields
 * `RESOURCE_EXHAUSTED` while the subscription itself is untouched, so the two
 * must not share a dialect.
 *
 * The request is not Gemini-shaped: there is no `contents` array. The turn is
 * a scalar `userMessage` with prior turns in `history`, addressed to a bare
 * `project` id (the `projects/<id>` form is rejected as an IAM path). The
 * response is a JSON **array** of chunk objects carrying `markdown`, rather
 * than SSE or NDJSON.
 *
 * See `providers/ANTIGRAVITY.md` for how the wire shape was established
 * and what remains unmapped.
 *
 * @module dialects/antigravity
 */

import { LlmError } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, GenerateOptions, StreamChunk, TokenUsage } from "@deepseek-ai/dsh-llm";
import type { Dialect, DialectAuth, DialectDefaults, RequestTurn, WireRequest } from "@dsh-stack/dialects";
import { splitRequestMessages } from "@dsh-stack/dialects";

/**
 * Header carrying the Cloud AI Companion project this account chats under.
 * The dialect is a pure serializer and cannot call `:loadCodeAssist` itself,
 * so the project arrives as resolved credential material like any other
 * per-account fact.
 */
export const ANTIGRAVITY_PROJECT_HEADER = "x-antigravity-project";

/** One history entry on the wire; the element field is `content`. */
interface WireHistoryEntry {
  content: string;
}

/** The `:streamGenerateChat` request body. */
interface WireChatRequest {
  project: string;
  userMessage: string;
  history?: WireHistoryEntry[];
}

/** One chunk of the JSON-array response. */
interface WireChatChunk {
  markdown?: string;
  usageMetadata?: {
    candidatesTokenCount?: string | number;
    totalTokenCount?: string | number;
  };
}

/**
 * Extracts the text content from a message's content blocks.
 *
 * Guarantees that the result is the concatenation of the message's text blocks,
 * with every other block contributing nothing.
 */
function textOf(content: readonly ContentBlock[]): string {
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

/**
 * Counts the numeric value if provided, returning the number or undefined if
 * the value is undefined, not a number, or infinite. Returns undefined for
 * non-numeric strings or invalid numbers.
 * @param value - The value to count, which can be a string, number, or undefined.
 * @returns The counted number or undefined if the value is invalid.
 */
function count(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Split the conversation into the turn being asked and everything before it.
 *
 * The wire takes one scalar `userMessage`, so the last user turn is the request
 * and the rest is history. This wire has no system slot at all, so the request's
 * system prompt leads the history instead, and still reaches the model rather
 * than being dropped.
 * @param turns - the conversation turns, in order.
 * @param system - the request's system prompt, when it carries one.
 * @returns the scalar turn and the preceding entries.
 */
function splitConversation(
  turns: readonly RequestTurn[],
  system: string | undefined,
): {
  userMessage: string;
  history: WireHistoryEntry[];
} {
  const history: WireHistoryEntry[] = [];
  let userMessage = "";
  if (system !== undefined) {
    history.push({ content: system });
  }
  for (const [index, turn] of turns.entries()) {
    const text = textOf(turn.content);
    if (text.length === 0) continue;
    const isLast = index === turns.length - 1;
    if (isLast && turn.role === "user") {
      userMessage = text;
      continue;
    }
    history.push({ content: text });
  }
  // Every wire request needs a turn to answer; an empty one is answered with
  // a complaint about the missing request rather than refused, which would be
  // a confusing way to surface a caller bug.
  if (userMessage.length === 0) {
    throw new LlmError("antigravity dialect requires a trailing user message", "INVALID_REQUEST");
  }
  return { userMessage, history };
}

/** Read the whole body; the response is one JSON array, not a framed stream. */
async function readAll(body: ReadableStream<BufferSource>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined)
        text += decoder.decode(value as AllowSharedBufferSource, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text + decoder.decode();
}

export const antigravityDialect: Dialect = {
  id: "antigravity",

  /** serialize implementation. */
  serialize(
    options: GenerateOptions,
    auth: DialectAuth,
    baseURL: string,
    _defaults: DialectDefaults,
  ): WireRequest {
    if (auth.token === undefined) {
      throw new LlmError("no bearer token supplied for an antigravity dialect request", "AUTH");
    }
    const project = auth.headers?.[ANTIGRAVITY_PROJECT_HEADER];
    if (project === undefined || project.length === 0) {
      throw new LlmError(
        "no Cloud AI Companion project for the antigravity route; store ANTIGRAVITY_PROJECT" +
          " (from :loadCodeAssist -> cloudaicompanionProject) through the account manager",
        "MISSING_CREDENTIAL",
      );
    }
    const { turns, system } = splitRequestMessages("antigravity", options, options.messages);
    const { userMessage, history } = splitConversation(turns, system);
    const body: WireChatRequest = {
      project,
      userMessage,
      ...(history.length > 0 ? { history } : {}),
    };
    // `modelConfigId` is deliberately omitted: every id the API publishes is
    // refused with ILLEGAL_MODEL_CONFIG, while omitting it serves the account's
    // default chat model on the paid tier. See ANTIGRAVITY.md.
    const { [ANTIGRAVITY_PROJECT_HEADER]: _project, ...forwarded } = auth.headers ?? {};
    return {
      url: `${baseURL.replace(/\/+$/, "")}:streamGenerateChat`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${auth.token}`,
        "x-goog-api-client": "gl-node",
        "user-agent": "Antigravity/2.0.1 (Jetbrains; DARWIN_ARM64)",
        ...forwarded,
      },
      body: JSON.stringify(body),
      framing: "ndjson",
    };
  },

  /**
   * Parses a stream of chat chunks into an AsyncGenerator of `StreamChunk`.
   *
   * The caller must provide a readable stream of buffer sources.
   * On success, it yields `StreamChunk` instances from the parsed stream.
   * On failure, it throws an error.
   */
  async *parse(body: ReadableStream<BufferSource>): AsyncGenerator<StreamChunk> {
    const raw = await readAll(body);
    let chunks: WireChatChunk[];
    try {
      const parsed: unknown = JSON.parse(raw);
      chunks = Array.isArray(parsed) ? (parsed as WireChatChunk[]) : [parsed as WireChatChunk];
    } catch {
      throw new LlmError(
        "antigravity response was not the expected JSON array",
        "MALFORMED_RESPONSE",
      );
    }

    const text = chunks.map((chunk) => chunk.markdown ?? "").join("");
    let usage: TokenUsage | undefined;
    for (const chunk of chunks) {
      const output = count(chunk.usageMetadata?.candidatesTokenCount);
      const total = count(chunk.usageMetadata?.totalTokenCount);
      if (output === undefined && total === undefined) continue;
      const outputTokens = output ?? 0;
      usage = {
        inputTokens: total === undefined ? 0 : Math.max(0, total - outputTokens),
        outputTokens,
      };
    }

    if (text.length > 0) {
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block: { type: "text", text } };
    }
    if (usage !== undefined) yield { type: "usage", usage };
    yield {
      type: "finish",
      reason:
        text.length > 0
          ? { kind: "stop" }
          : {
              kind: "error",
              failure: { message: "antigravity returned no content", code: "EMPTY_RESPONSE" },
            },
    };
  },
};
