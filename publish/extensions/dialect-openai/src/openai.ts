/**
 * The OpenAI-compatible chat-completions dialect. Serialization follows the
 * `dsh-llm-deepseek` conventions: user text is joined, assistant text becomes
 * `content`, tool calls become `tool_calls`, tool results become separate
 * `tool` messages, and assistant reasoning is replayed as `reasoning_content`
 * only on tool-call turns. Core image blocks are rejected explicitly because
 * this wire route is text-only.
 *
 * @module dialects/openai
 */

import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
import type { AssistantMessage, ContentBlock, GenerateOptions } from "@deepseek-ai/dsh-llm";
import type {
  Dialect,
  DialectAuth,
  DialectDefaults,
  RequestTurn,
  WireRequest,
} from "@dsh-stack/dialects";
import { parseSseData, splitRequestMessages } from "@dsh-stack/dialects";
import { translateOpenAi } from "./translate-openai.js";

/** A request `messages` entry, discriminated on `role`. */
type WireMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "tool"; tool_call_id: string; content: string }
  | {
      role: "assistant";
      content: string;
      /** CoT passback on tool-call turns; ignored on tool-call-free turns. */
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };

/** The request body for `POST {baseURL}/chat/completions`. */
interface WireRequestBody {
  model: string;
  messages: WireMessage[];
  stream: true;
  stream_options: { include_usage: true };
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  /**
   * Reasoning depth for models that expose it. The OpenAI-compatible spelling,
   * which Zen, Kimi, Grok, DeepSeek and OpenAI all accept; providers that do
   * not understand it ignore an unknown body field rather than failing, and the
   * field is only sent when the caller actually picked an effort.
   */
  // jscpd:ignore-start -- accepted intentional duplication, see PR discussion
  reasoning_effort?: string;
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
    throw new LlmError("The openai dialect does not support image content.", "UNSUPPORTED_CONTENT");
    // jscpd:ignore-end
  }
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: AssistantMessage): WireMessage {
  const text = flattenText(message.content);
  const reasoning = message.content
    .filter((block) => block.type === "reasoning")
    .map((block) => block.text)
    .join("");
  const toolCalls = message.content
    .filter((block) => block.type === "tool-call")
    .map((block) => ({
      id: block.id,
      type: "function" as const,
      function: { name: block.name, arguments: block.arguments },
    }));
  return {
    role: "assistant",
    content: text,
    ...(toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

/**
 * Serialize the conversation turns. A tool result is a first-class `tool`-role
 * message on this wire, keyed by the `toolCallId` its harness message carries,
 * so one turn becomes exactly one wire message.
 * @param messages - the conversation turns, in order.
 * @returns the wire messages; order preserved.
 */
export function serializeMessages(messages: readonly RequestTurn[]): WireMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case "assistant":
        return serializeAssistant(message);
      case "tool":
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: flattenText(message.content) || "(no output)",
        };
      case "user":
        return { role: "user", content: flattenText(message.content) };
    }
  });
}

/** stripTrailingSlash implementation. */
function stripTrailingSlash(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * The OpenAI-compatible dialect. `baseURL` is the route base (e.g.
 * `https://api.kimi.com/coding/v1`); the dialect appends `/chat/completions`.
 * The request always streams with usage reporting on; optional fields are
 * omitted rather than sent as null. `defaults.extra` fields are merged into
 * the body verbatim (provider-specific toggles such as DeepSeek's
 * `thinking`).
 */
export const openaiDialect: Dialect = {
  id: "openai",

  /**
   * Serializes the request options into a wire-compatible request.
   *
   * @param options - The generation options for the request.
   * @param auth - The authentication details for the request.
   * @param baseURL - The base URL for the request.
   * @param defaults - Default settings for the request.
   * @returns A `WireRequest` object representing the serialized request.
   * @throws Throws a `LlmError` if no API key or bearer token is provided.
   */
  serialize(
    options: GenerateOptions,
    auth: DialectAuth,
    baseURL: string,
    defaults: DialectDefaults,
  ): WireRequest {
    const bearer = auth.token ?? auth.apiKey;
    if (bearer === undefined || bearer === "") {
      throw new LlmError(
        "no API key or bearer token supplied for an openai dialect request",
        "AUTH",
      );
    }
    const { turns, system } = splitRequestMessages("openai", options, options.messages);
    for (const turn of turns) assertTextOnly(turn.content);
    const messages: WireMessage[] = [];
    if (system !== undefined) {
      messages.push({ role: "system", content: system });
    }
    messages.push(...serializeMessages(turns));

    const body: WireRequestBody = {
      model: options.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(options.tools !== undefined && options.tools.length > 0
        ? {
            tools: options.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
      ...(options.stop !== undefined ? { stop: options.stop } : {}),
      ...(options.reasoningEffort !== undefined
        ? { reasoning_effort: options.reasoningEffort }
        : {}),
    };

    return {
      url: `${stripTrailingSlash(baseURL)}/chat/completions`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${bearer}`,
        ...auth.headers,
      },
      body: JSON.stringify({ ...body, ...defaults.extra }),
      framing: "sse",
    };
  },

  /** parse implementation. */
  parse(body, onActivity) {
    return translateOpenAi(parseSseData(body, onActivity));
  },
};
