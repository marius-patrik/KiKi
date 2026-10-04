/**
 * The Google Code Assist dialect. Serialization covers text-only conversation
 * plus tool calls and results; reasoning and image blocks are unsupported on
 * this route. The Code Assist endpoint is a JSON wrapper over the Vertex
 * `GenerateContent` vocabulary: the harness conversation serializes into the
 * inner `request` (contents, systemInstruction, tools, generationConfig,
 * `session_id`), and the request body nests it under `request` alongside
 * `model`, `project`, and `user_prompt_id`. Response SSE payloads are wrapped
 * as `{traceId, response}` and unwrapped before the shared Gemini translator.
 *
 * @module dialects/code-assist
 */

import { randomUUID } from "node:crypto";
import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, GenerateOptions } from "@deepseek-ai/dsh-llm";
import type { Dialect, DialectAuth, DialectDefaults, WireRequest } from "@dsh-stack/dialects";
import { parseSseEvents, splitRequestMessages } from "@dsh-stack/dialects";
import { translateGemini, serializeContents } from "@dsh-stack/dialect-gemini";
import type { WireContent } from "@dsh-stack/dialect-gemini";

/** The inner `toVertexGenerateContentRequest` nested under `request`. */
// jscpd:ignore-start -- structurally similar to gemini.ts's block but encodes Code Assist's distinct wire semantics; forcing a shared helper would blur real per-dialect differences
interface WireCodeAssistRequestBody {
  systemInstruction?: { parts: [{ text: string }] };
  contents: WireContent[];
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  // jscpd:ignore-end
  session_id?: string;
}

/** The Code Assist request body: a wrapper over the inner Vertex request. */
interface WireCodeAssistWrapper {
  model: string;
  project: string;
  user_prompt_id: string;
  request: WireCodeAssistRequestBody;
}

/** Reject core image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError(
      "The code-assist dialect does not support image content.",
      "UNSUPPORTED_CONTENT",
    );
  }
}

/**
 * Builds a URL for streaming content with SSE (Server-Sent Events).
 *
 * Guarantees: Adds `:streamGenerateContent?alt=sse` to the base URL if not already present.
 * Returns: The constructed URL for streaming content.
 * Fails: If the base URL contains `:streamGenerateContent` but does not include `?alt=sse`, appends it.
 */
function buildUrl(base: string): string {
  if (base.includes(":streamGenerateContent")) {
    return base.includes("?") ? base : `${base}?alt=sse`;
  }
  return `${base.endsWith("/") ? base.slice(0, -1) : base}:streamGenerateContent?alt=sse`;
}

/**
 * The Code Assist dialect. `baseURL` is the service root (e.g.
 * `https://cloudcode-pa.googleapis.com/v1internal`); the dialect appends
 * `:streamGenerateContent?alt=sse`. Credentials must be an OAuth bearer token;
 * the `session_id`/`user_prompt_id` UUIDs mark one agent turn, and the
 * `x-goog-api-client`/`user-agent` headers are required for quota routing.
 */
export const codeAssistDialect: Dialect = {
  id: "code-assist",

  /**
   * Serializes the request options into a wire request for the code-assist dialect.
   *
   * @param options - The generation options containing messages to be serialized.
   * @param auth - Authentication credentials required for the request.
   * @param baseURL - The base URL for the service endpoint.
   * @param defaults - Default settings for the dialect.
   * @returns A `WireRequest` object representing the serialized request.
   * @throws Throws an `LlmError` if no OAuth bearer token is provided.
   */
  serialize(
    options: GenerateOptions,
    auth: DialectAuth,
    baseURL: string,
    defaults: DialectDefaults,
  ): WireRequest {
    if (auth.token === undefined || auth.token === "") {
      throw new LlmError(
        "no OAuth bearer token supplied for a code-assist dialect request",
        "AUTH",
      );
    }
    // jscpd:ignore-start -- structurally similar to gemini.ts's block but encodes Code Assist's distinct wire semantics; forcing a shared helper would blur real per-dialect differences
    const { turns, system } = splitRequestMessages("code-assist", options, options.messages);
    for (const turn of turns) assertTextOnly(turn.content);
    const request: WireCodeAssistRequestBody = {
      contents: serializeContents(turns),
      ...(system !== undefined ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(options.tools !== undefined && options.tools.length > 0
        ? {
            tools: [
              {
                functionDeclarations: options.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                })),
              },
            ],
          }
        : {}),
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? defaults.maxTokens,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.stop !== undefined ? { stopSequences: options.stop } : {}),
      },
      // jscpd:ignore-end
      session_id: randomUUID(),
    };
    const wrapper: WireCodeAssistWrapper = {
      model: options.model,
      project: "",
      user_prompt_id: randomUUID(),
      request,
    };

    return {
      url: buildUrl(baseURL),
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${auth.token}`,
        "x-goog-api-client": "gl-node",
        "user-agent": "Antigravity/2.0.1 (Jetbrains; DARWIN_ARM64)",
        ...auth.headers,
      },
      body: JSON.stringify({ ...wrapper, ...defaults.extra }),
      framing: "sse",
    };
  },

  /** parse implementation. */
  parse(body, onActivity) {
    /** unwrap implementation. */
    async function* unwrap(): AsyncIterable<string> {
      for await (const { data } of parseSseEvents(body, onActivity)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          // Comments and keep-alives carry no payload; skip them rather than
          // aborting the stream.
          continue;
        }
        const record = parsed as { response?: unknown };
        yield JSON.stringify(record.response ?? record);
      }
    }
    return translateGemini(unwrap());
  },
};
