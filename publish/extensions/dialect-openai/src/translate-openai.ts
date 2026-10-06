/**
 * Translate OpenAI-compatible chat-completions SSE payloads into the harness
 * `StreamChunk` protocol. Mirrors the `dsh-llm-deepseek` translation: one
 * stateful harness block per content, reasoning, or tool-call index; finish
 * reason and the latest usage deferred until the `[DONE]` sentinel; reasoning
 * surfaced whenever the wire emits it. An empty initial reasoning delta does
 * not open a block.
 *
 * @module dialects/translate-openai
 */

import { EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from "@deepseek-ai/dsh-llm";
import { DONE } from "@dsh-stack/dialects";

/** One streamed choice; `finish_reason` is non-null only on its terminal chunk. */
interface WireChoice {
  delta?: WireDelta;
  finish_reason?: string | null;
}

/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
interface WireDelta {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: WireToolCallDelta[];
}

/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number;
  /** Present on the first delta of each call only. */
  id?: string;
  type?: "function";
  function?: {
    /** Present on the first delta of each call only. */
    name?: string;
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string;
  };
}

/** One parsed chat.completion.chunk payload. */
interface WireChunk {
  choices?: WireChoice[];
  /** Arrives attached to the finish chunk and/or as a trailing usage-only chunk. */
  usage?: WireUsage | null;
}

/**
 * Wire token accounting. `prompt_tokens` INCLUDES cache hits when the server
 * reports a cached count; `mapUsage` subtracts them to keep the harness
 * convention of disjoint counts.
 */
interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

/** One open block under assembly. */
interface OpenBlock {
  index: number;
  kind: "text" | "reasoning" | "tool-call";
  text: string;
  /** tool-call only */
  callId?: string;
  name?: string;
}

/**
 * Map the wire finish_reason vocabulary to the harness FinishReason.
 * @param reason - the wire `finish_reason` string.
 * @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the uppercased value as `code`.
 */
export function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case "stop":
      return { kind: "stop" };
    case "tool_calls":
    case "function_call":
      return { kind: "tool-calls" };
    case "length":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
      };
  }
}

/**
 * Map wire usage fields to disjoint harness counts; cache/reasoning fields are
 * present only when the wire reported them.
 * @param usage - wire usage from the finish chunk or the trailing usage-only chunk.
 * @returns disjoint harness counts.
 */
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  return {
    inputTokens: (usage.prompt_tokens ?? 0) - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens ?? 0,
    ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}),
    // jscpd:ignore-start -- structurally similar to translate-claude.ts's translation block but encodes OpenAI-specific message shape; forcing a shared helper would blur real per-dialect differences
    ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
  };
}

/** Assemble the final ContentBlock for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: ToolCallId(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text,
      };
  }
}

/**
 * Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
 * Malformed JSON payloads abort the stream with `MALFORMED_RESPONSE`.
 * @param payloads - SSE data payloads from {@link parseSseData}, `[DONE]`-terminated.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` are deferred to the `[DONE]`
 *   sentinel. A `stop` (or absent) finish with no opened blocks is a degenerate provider completion
 *   and maps to an `EMPTY_RESPONSE` error finish instead of a successful empty message.
 */
export async function* translateOpenAi(
  // jscpd:ignore-end
  payloads: AsyncIterable<string>,
): AsyncGenerator<StreamChunk> {
  let nextIndex = 0;
  let textBlock: OpenBlock | undefined;
  let reasoningBlock: OpenBlock | undefined;
  const toolBlocks = new Map<number, OpenBlock>();
  const order: OpenBlock[] = [];
  let pendingFinish: FinishReason | undefined;
  let pendingUsage: TokenUsage | undefined;

  /**
   * Opens a new block in the order, appending it to the pending sequence.
   * Guarantees that the block is added to the `order` and returns the new block.
   * On failure, yields a "finish" event with an error indicating no content was returned.
   * @param kind - The kind of block to open.
   * @returns The newly created block.
   */
  function open(kind: OpenBlock["kind"]): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: "" };
    order.push(block);
    return block;
  }

  for await (const payload of payloads) {
    if (payload === DONE) {
      for (const block of order) {
        yield { type: "block-end", index: block.index, block: closeBlock(block) };
      }
      // jscpd:ignore-start -- structurally similar to translate-claude.ts's translation block but encodes OpenAI-specific message shape; forcing a shared helper would blur real per-dialect differences
      if (pendingUsage) yield { type: "usage", usage: pendingUsage };
      const reason = pendingFinish ?? { kind: "stop" as const };
      yield {
        type: "finish",
        reason:
          reason.kind === "stop" && order.length === 0
            ? {
                kind: "error",
                failure: {
                  message: "model returned a completed response with no content",
                  code: EMPTY_RESPONSE_CODE,
                },
              }
            : reason,
        // jscpd:ignore-end
      };
      return;
    }

    let chunk: WireChunk;
    try {
      chunk = JSON.parse(payload) as WireChunk;
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;

      const reasoning = delta?.reasoning_content;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        if (!reasoningBlock) {
          reasoningBlock = open("reasoning");
          yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" };
        }
        reasoningBlock.text += reasoning;
        yield { type: "reasoning-delta", index: reasoningBlock.index, text: reasoning };
      }

      const content = delta?.content;
      if (typeof content === "string" && content.length > 0) {
        if (!textBlock) {
          textBlock = open("text");
          yield { type: "block-start", index: textBlock.index, blockType: "text" };
        }
        textBlock.text += content;
        yield { type: "text-delta", index: textBlock.index, text: content };
      }

      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index);
        if (!block) {
          block = open("tool-call");
          toolBlocks.set(call.index, block);
          yield { type: "block-start", index: block.index, blockType: "tool-call" };
        }
        if (call.id !== undefined) block.callId = call.id;
        if (call.function?.name !== undefined) block.name = call.function.name;
        const fragment = call.function?.arguments ?? "";
        block.text += fragment;
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: ToolCallId(block.callId ?? ""),
          ...(block.name !== undefined ? { name: block.name } : {}),
          argumentsDelta: fragment,
        };
      }

      if (typeof choice.finish_reason === "string") {
        pendingFinish = mapFinishReason(choice.finish_reason);
      }
    }

    if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
  }

  // parseSseData guarantees the [DONE] sentinel (or throws); reaching here
  // means the payload source violated that contract.
  throw new LlmError("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}
