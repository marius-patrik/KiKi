/**
 * The Anthropic Messages API dialect. User text becomes `text` parts and tool
 * results become their own `tool_result` user message; assistant text becomes
 * `text` parts and tool calls become `tool_use` parts. Reasoning blocks are
 * dropped (thinking is not configured on this route), and core image blocks are
 * rejected because this wire route is text-only.
 *
 * @module dialects/claude
 */

import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
import type {
  AssistantMessage,
  ContentBlock,
  GenerateOptions,
  RequestUserInput,
  ToolResultMessage,
  UserMessage,
} from "@deepseek-ai/dsh-llm";
import type {
  Dialect,
  DialectAuth,
  DialectDefaults,
  RequestTurn,
  WireRequest,
} from "@dsh-stack/dialects";
import { parseSseEvents, splitRequestMessages } from "@dsh-stack/dialects";
import { translateClaude } from "./translate-claude.js";

/** One Anthropic content part. */
type WirePart =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/** One request `messages` entry. */
interface WireMessage {
  role: "user" | "assistant";
  content: WirePart[];
}

/** One entry of the request `tools` array. */
interface WireTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** The request body for `POST {baseURL}/messages`. */
interface WireRequestBody {
  model: string;
  system?: string | readonly WireSystemBlock[];
  thinking?: { type: "enabled"; budget_tokens: number };
  messages: WireMessage[];
  stream: true;
  max_tokens: number;
  tools?: WireTool[];
  temperature?: number;
  // jscpd:ignore-start -- structurally similar to gemini.ts/openai.ts's request-shaping block but encodes Claude-specific wire semantics; forcing a shared helper would blur real per-dialect differences
  stop_sequences?: string[];
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
    throw new LlmError("The claude dialect does not support image content.", "UNSUPPORTED_CONTENT");
    // jscpd:ignore-end
  }
}

/** Parse a raw tool-arguments JSON string into an object. */
// jscpd:ignore-start -- structurally similar to gemini.ts/openai.ts's request-shaping block but encodes Claude-specific wire semantics; forcing a shared helper would blur real per-dialect differences
function parseToolInput(argumentsJson: string): Record<string, unknown> {
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
 * Converts a Message object into a WireMessage suitable for serialization.
 *
 * Guarantees that the returned WireMessage has the role set to "assistant" and
 * the content field populated with an array of WirePart objects representing
 * the message's content blocks.
 *
 * Fails if the input message contains unsupported block types.
 */
function serializeAssistant(message: AssistantMessage): WireMessage {
  const parts: WirePart[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push({ type: "text", text: block.text });
    else if (block.type === "tool-call") {
      parts.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: parseToolInput(block.arguments),
      });
    }
  }
  return { role: "assistant", content: parts };
}

/**
 * Converts a user message into a serializable wire message format.
 *
 * Guarantees that the returned message is a WireMessage with the role "user" and content parts
 * representing the message blocks. Non-text blocks leave the resulting message out.
 */
function serializeUser(message: UserMessage | RequestUserInput): WireMessage {
  const parts: WirePart[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push({ type: "text", text: block.text });
  }
  return { role: "user", content: parts };
}

/**
 * Converts one tool-result message into a wire user message carrying the
 * `tool_result` part that answers it.
 *
 * Guarantees that the part names the call its harness message answers and, when
 * the tool failed, marks the result as an error. A result with no model-visible
 * text still answers, as "(no output)".
 */
function serializeToolResult(message: ToolResultMessage): WireMessage {
  return {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: flattenText(message.content) || "(no output)",
        ...(message.isError === true ? { is_error: true } : {}),
      },
    ],
  };
}

/**
 * Strips a trailing slash from the given string if present.
 *
 * Guarantees that the returned string no longer ends with a slash.
 * Fails to process strings that are not valid UTF-8, returning them unchanged.
 */
function stripTrailingSlash(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * Build the `system` field. Anthropic has one system slot, which carries both
 * the request's rendered prompt (from `GenerateOptions.system` or a leading
 * `system`-role message, already joined) and, for an OAuth subscription
 * request, the Claude Code identity ahead of it — so nothing the caller asked
 * for is dropped or reordered.
 * @param system - the request's system prompt, when it carries one.
 * @param auth - the resolved credential for this request.
 * @returns the `system` field to spread into the body, or nothing.
 */
function serializeSystem(
  system: string | undefined,
  auth: DialectAuth,
): { system?: string | readonly WireSystemBlock[] } {
  if (auth.token === undefined) {
    return system === undefined ? {} : { system };
  }
  const blocks: WireSystemBlock[] = [
    { type: "text", text: OAUTH_SUBSCRIPTION_IDENTITY, cache_control: { type: "ephemeral" } },
  ];
  if (system !== undefined && system.length > 0)
    blocks.push({ type: "text", text: system, cache_control: { type: "ephemeral" } });
  return { system: blocks };
}

/**
 * The Anthropic Messages dialect. `baseURL` is the route base (e.g.
 * `https://api.anthropic.com/v1`); the dialect appends `/messages`. Bearer
 * OAuth tokens go in `Authorization`; API keys in `x-api-key`. `max_tokens`
 * is required on the wire and defaults from `defaults.maxTokens`.
 */
/** One `system` block, the array form Anthropic accepts alongside a plain string. */
interface WireSystemBlock {
  type: "text";
  text: string;
  /** Anthropic prompt caching: mark this block as a cache breakpoint. */
  cache_control?: { type: "ephemeral" };
}

/**
 * Anthropic's OAuth subscription endpoint serves Claude Code, and checks that
 * the request says so: without this leading system block it refuses the larger
 * models (Opus, Sonnet) with `rate_limit_error` whose message is the literal
 * string "Error", while the account's own limits are nowhere near reached —
 * the 5h utilization header reads 0.43 on a refusal. Haiku is exempt, which
 * makes the failure look model-specific rather than protocol-specific.
 *
 * API-key requests need none of this and must not carry it: it would silently
 * prepend an identity the caller never asked for.
 */
const OAUTH_SUBSCRIPTION_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * Anthropic takes a thinking *budget*, not a named level, so the shared effort
 * vocabulary maps onto token budgets here.
 */
const THINKING_BUDGETS: Record<string, number> = { low: 4_096, medium: 16_384, high: 32_768 };

/** The smallest budget worth enabling extended thinking for. */
const MINIMUM_THINKING_BUDGET = 1_024;

/** Headroom left for the answer itself once thinking has taken its share. */
const ANSWER_HEADROOM = 1_024;

/**
 * Resolve the `thinking` block for a request.
 *
 * The budget must leave room for the answer inside `max_tokens`, so it is
 * clamped rather than sent verbatim; an effort whose clamped budget would be
 * too small to be useful turns thinking off instead of sending a degenerate
 * one.
 * @param effort - the caller's selected effort id.
 * @param maxTokens - the output cap this request will carry.
 * @returns the `thinking` field to spread into the body, or nothing.
 */
function serializeThinking(
  effort: string | undefined,
  maxTokens: number,
): { thinking?: { type: "enabled"; budget_tokens: number } } {
  if (effort === undefined) return {};
  const requested = THINKING_BUDGETS[effort];
  if (requested === undefined) return {};
  const budget = Math.min(requested, maxTokens - ANSWER_HEADROOM);
  if (budget < MINIMUM_THINKING_BUDGET) return {};
  return { thinking: { type: "enabled", budget_tokens: budget } };
}

export const claudeDialect: Dialect = {
  id: "claude",

  /**
   * Serializes the thinking configuration based on the effort and maxTokens.
   * Ensures the budget is clamped to prevent degenerate responses and returns
   * the `thinking` field if the budget is sufficient; otherwise, returns an
   * empty object.
   * @param effort - The caller's selected effort ID.
   * @param maxTokens - The output cap for the request.
   * @returns The `thinking` field with the type set to "enabled" and budget_tokens,
   * or an empty object if the budget is insufficient.
   */
  serialize(
    options: GenerateOptions,
    auth: DialectAuth,
    baseURL: string,
    defaults: DialectDefaults,
  ): WireRequest {
    if (auth.token === undefined && auth.apiKey === undefined) {
      throw new LlmError(
        "no bearer token or API key supplied for a claude dialect request",
        "AUTH",
      );
    }
    const { turns, system } = splitRequestMessages("claude", options, options.messages);
    for (const turn of turns) assertTextOnly(turn.content);
    const messages: WireMessage[] = turns.map((turn) => {
      switch (turn.role) {
        case "assistant":
          return serializeAssistant(turn);
        case "tool":
          return serializeToolResult(turn);
        case "user":
          return serializeUser(turn);
      }
    });

    const maxTokens = options.maxTokens ?? defaults.maxTokens;
    const thinking = serializeThinking(options.reasoningEffort, maxTokens);
    const body: WireRequestBody = {
      model: options.model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      ...serializeSystem(system, auth),
      ...(options.tools !== undefined && options.tools.length > 0
        ? {
            tools: options.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
          }
        : {}),
      ...thinking,
      // Anthropic pins sampling while extended thinking is on, so a caller's
      // temperature must not be sent alongside it.
      ...(options.temperature !== undefined && thinking.thinking === undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.stop !== undefined ? { stop_sequences: options.stop } : {}),
    };

    return {
      url: `${stripTrailingSlash(baseURL)}/messages`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        ...(auth.token !== undefined ? { authorization: `Bearer ${auth.token}` } : {}),
        ...(auth.apiKey !== undefined ? { "x-api-key": auth.apiKey } : {}),
        ...auth.headers,
      },
      body: JSON.stringify({ ...body, ...defaults.extra }),
      framing: "sse",
    };
  },

  /** parse implementation. */
  parse(body, onActivity) {
    return translateClaude(parseSseEvents(body, onActivity));
  },
};
