/**
 * The Gemini dialect. Serialization covers text-only conversation plus tool
 * calls and results (a `functionCall`/`functionResponse` round trip); reasoning
 * and image blocks are unsupported on this route. A tool result is its own
 * `tool`-role turn whose wire part resolves the tool name from the request's
 * assistant tool-call history.
 *
 * @module dialects/gemini
 */

import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, GenerateOptions, ToolCallId } from "@deepseek-ai/dsh-llm";
import type {
  Dialect,
  DialectAuth,
  DialectDefaults,
  RequestTurn,
  WireRequest,
} from "@dsh-stack/dialects";
import { parseNdjson, splitRequestMessages } from "@dsh-stack/dialects";
import { translateGemini } from "./translate-gemini.js";

/** One Gemini content part. */
type WirePart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/** One `contents` entry; Gemini roles are `user` and `model`. */
export interface WireContent {
  role: "user" | "model";
  parts: WirePart[];
}

/** The request body for a `:streamGenerateContent` call. */
// jscpd:ignore-start -- structurally similar to claude.ts's request-shaping block but encodes Gemini-specific wire semantics; forcing a shared helper would blur real per-dialect differences
interface WireRequestBody {
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
}

/** Join the text blocks of a message. */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Reject core image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError("The gemini dialect does not support image content.", "UNSUPPORTED_CONTENT");
    // jscpd:ignore-end
  }
}

/** Parse a raw tool-arguments JSON string into an object. */
// jscpd:ignore-start -- structurally similar to claude.ts's request-shaping block but encodes Gemini-specific wire semantics; forcing a shared helper would blur real per-dialect differences
function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(argumentsJson);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    throw new LlmError(
      "assistant tool-call arguments are not valid JSON",
      "MALFORMED_TOOL_ARGUMENTS",
    );
  }
}
// jscpd:ignore-end

/**
 * Build the call-id → tool-name index from the request's assistant tool-call
 * history, so `functionResponse` parts can name the function they answer.
 * @param messages - the conversation turns.
 * @returns the name lookup for every tool call in the conversation.
 */
export function buildToolNameIndex(messages: readonly RequestTurn[]): Map<ToolCallId, string> {
  const index = new Map<ToolCallId, string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type === "tool-call") index.set(block.id, block.name);
    }
  }
  return index;
}

/**
 * Serialize the conversation turns into Gemini contents; a turn with no parts is
 * dropped. A tool result becomes the `functionResponse` answering its call.
 * @param messages - the conversation turns, in order.
 * @returns the wire contents, roles `user`/`model`.
 */
export function serializeContents(messages: readonly RequestTurn[]): WireContent[] {
  const toolNames = buildToolNameIndex(messages);
  const contents: WireContent[] = [];
  for (const message of messages) {
    const parts: WirePart[] = [];
    switch (message.role) {
      case "assistant":
        for (const block of message.content) {
          if (block.type === "text") parts.push({ text: block.text });
          else if (block.type === "tool-call") {
            parts.push({
              functionCall: { name: block.name, args: parseToolArgs(block.arguments) },
            });
          }
        }
        break;
      case "tool": {
        const name = toolNames.get(message.toolCallId);
        if (name === undefined) {
          throw new LlmError(
            `tool result for call "${message.toolCallId}" has no tool call in the conversation`,
            "UNSUPPORTED",
          );
        }
        parts.push({
          functionResponse: {
            name,
            response: { result: flattenText(message.content) || "(no output)" },
          },
        });
        break;
      }
      case "user":
        for (const block of message.content) {
          if (block.type === "text") parts.push({ text: block.text });
        }
        break;
    }
    if (parts.length > 0) {
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
    }
  }
  return contents;
}

/**
 * Builds a URL with SSE query parameter if necessary.
 *
 * Guarantees the returned URL includes `?alt=sse` if the base URL does not
 * already contain a query string or end with `:streamGenerateContent`.
 *
 * @param base - The base URL to build.
 * @returns The URL with `?alt=sse` appended if needed.
 */
function buildUrl(base: string): string {
  if (base.includes("?")) return base;
  if (base.endsWith(":streamGenerateContent")) return `${base}?alt=sse`;
  return `${base}:streamGenerateContent?alt=sse`;
}

/**
 * The Gemini dialect. `baseURL` is the full endpoint: the caller supplies the
 * `:streamGenerateContent` (or dispatch) URL, with or without a model
 * placeholder; the dialect appends `?alt=sse` when no query is present.
 * Credentials are `__Secure-` cookies or an `x-goog-api-key`.
 */
export const geminiDialect: Dialect = {
  id: "gemini",

  /**
   * Serializes the request options into a wire-compatible request for the Gemini dialect.
   *
   * @param options - The generation options containing messages and system instruction.
   * @param auth - The authentication details required for the request.
   * @param baseURL - The base URL for the request, including the endpoint and query parameters.
   * @param defaults - Default settings for the dialect.
   * @returns A `WireRequest` object representing the serialized request.
   * @throws Throws an `LlmError` if no authentication credentials (cookies or API key) are provided.
   */
  serialize(
    options: GenerateOptions,
    auth: DialectAuth,
    baseURL: string,
    defaults: DialectDefaults,
  ): WireRequest {
    if (auth.cookies === undefined && auth.apiKey === undefined) {
      throw new LlmError("no cookies or API key supplied for a gemini dialect request", "AUTH");
    }
    // jscpd:ignore-start -- structurally similar to claude.ts's request-shaping block but encodes Gemini-specific wire semantics; forcing a shared helper would blur real per-dialect differences
    const { turns, system } = splitRequestMessages("gemini", options, options.messages);
    for (const turn of turns) assertTextOnly(turn.content);
    const body: WireRequestBody = {
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
    };

    const cookieHeader =
      auth.cookies !== undefined
        ? Object.entries(auth.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join("; ")
        : undefined;

    return {
      url: buildUrl(baseURL),
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookieHeader !== undefined ? { cookie: cookieHeader } : {}),
        ...(auth.apiKey !== undefined ? { "x-goog-api-key": auth.apiKey } : {}),
        ...auth.headers,
      },
      body: JSON.stringify({ ...body, ...defaults.extra }),
      framing: "ndjson",
    };
  },

  /** parse implementation. */
  parse(body, onActivity) {
    return translateGemini(parseNdjson(body, onActivity));
  },
};
