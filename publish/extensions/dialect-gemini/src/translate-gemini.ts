/**
 * Translate Gemini NDJSON payloads into the harness `StreamChunk` protocol.
 * Gemini streams CUMULATIVE candidate content: each payload repeats the prior
 * parts and appends to the last text part, so this translator diffs per-part
 * text to emit deltas and deduplicates complete `functionCall` parts by their
 * part index. Wire part indexes double as harness block indexes (they are
 * strictly first-seen order). Usage and the terminal finish flush at EOF, so
 * no chunk follows `finish`.
 *
 * @module dialects/translate-gemini
 */

import { EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from "@deepseek-ai/dsh-llm";

/** A `functionCall` part; `args` is a complete object (Gemini never streams it incrementally). */
interface WireGeminiFunctionCall {
  name?: string;
  args?: Record<string, unknown>;
}

/** One candidate content part. */
interface WireGeminiPart {
  text?: string;
  functionCall?: WireGeminiFunctionCall;
}

/** One candidate of a payload; text parts grow cumulatively across payloads. */
interface WireGeminiCandidate {
  content?: { role?: string; parts?: WireGeminiPart[] };
  finishReason?: string;
}

/** One parsed NDJSON payload. `alternatives` is the older spelling of `candidates`. */
interface WireGeminiChunk {
  candidates?: WireGeminiCandidate[];
  alternatives?: WireGeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

/** One open block under assembly. */
interface OpenBlock {
  index: number;
  kind: "text" | "tool-call";
  text: string;
  callId: ToolCallId;
  name?: string;
}

/**
 * Map the wire `finishReason` vocabulary to the harness FinishReason.
 * @param reason - the wire `finishReason` string.
 * @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the value as `code`.
 */
export function mapGeminiFinishReason(reason: string): FinishReason {
  switch (reason) {
    case "STOP":
      return { kind: "stop" };
    case "MAX_TOKENS":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason },
      };
  }
}

/**
 * Consume NDJSON payloads and yield StreamChunks. Malformed JSON payloads
 * abort the stream with `MALFORMED_RESPONSE`.
 * @param payloads - NDJSON payloads from {@link parseNdjson}.
 * @returns text deltas as cumulative parts grow and one complete tool-call block per `functionCall`
 *   part; `block-end`s, `usage`, and `finish` are deferred to EOF. A `stop` (or absent) finish with
 *   no opened blocks maps to an `EMPTY_RESPONSE` error finish. Synthesized `ToolCallId`s are
 *   `gemini-<partIndex>`.
 */
export async function* translateGemini(
  payloads: AsyncIterable<string>,
): AsyncGenerator<StreamChunk> {
  const textSent = new Map<number, string>();
  const functionSent = new Map<number, WireGeminiFunctionCall>();
  let pendingFinish: FinishReason | undefined;
  let pendingUsage: TokenUsage | undefined;

  for await (const payload of payloads) {
    let chunk: WireGeminiChunk;
    try {
      chunk = JSON.parse(payload) as WireGeminiChunk;
    } catch {
      throw new LlmError(
        `malformed NDJSON payload: ${payload.slice(0, 120)}`,
        "MALFORMED_RESPONSE",
      );
    }

    if (chunk.promptFeedback?.blockReason !== undefined) {
      pendingFinish = {
        kind: "error",
        failure: { message: "content blocked by provider", code: "CONTENT_BLOCKED" },
      };
    }

    const candidate = chunk.candidates?.[0] ?? chunk.alternatives?.[0];
    for (const [index, part] of (candidate?.content?.parts ?? []).entries()) {
      if (typeof part.text === "string" && part.text.length > 0) {
        const sent = textSent.get(index) ?? "";
        if (part.text.length > sent.length) {
          if (textSent.get(index) === undefined) {
            yield { type: "block-start", index, blockType: "text" };
          }
          const fragment = part.text.slice(sent.length);
          textSent.set(index, part.text);
          yield { type: "text-delta", index, text: fragment };
        }
      }
      if (part.functionCall !== undefined && !functionSent.has(index)) {
        functionSent.set(index, part.functionCall);
        const args =
          part.functionCall.args !== undefined ? JSON.stringify(part.functionCall.args) : "{}";
        yield { type: "block-start", index, blockType: "tool-call" };
        yield {
          type: "tool-call-delta",
          index,
          id: ToolCallId(`gemini-${index}`),
          name: part.functionCall.name,
          argumentsDelta: args,
        };
      }
    }

    if (candidate?.finishReason !== undefined) {
      pendingFinish = mapGeminiFinishReason(candidate.finishReason);
    }
    if (chunk.usageMetadata !== undefined) {
      pendingUsage = {
        inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
        outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
      };
    }
  }

  const openIndexes = new Set<number>([...textSent.keys(), ...functionSent.keys()]);
  const blocks: OpenBlock[] = [];
  for (const index of [...openIndexes].sort((a, b) => a - b)) {
    const text = textSent.get(index);
    if (text !== undefined) {
      blocks.push({ index, kind: "text", text, callId: ToolCallId(`gemini-${index}`) });
    } else {
      const call = functionSent.get(index) ?? {};
      const args = call.args !== undefined ? JSON.stringify(call.args) : "{}";
      blocks.push({
        index,
        kind: "tool-call",
        text: args,
        callId: ToolCallId(`gemini-${index}`),
        name: call.name,
      });
    }
  }
  for (const block of blocks) {
    yield {
      type: "block-end",
      index: block.index,
      block:
        block.kind === "text"
          ? { type: "text", text: block.text }
          : { type: "tool-call", id: block.callId, name: block.name ?? "", arguments: block.text },
    };
  }
  if (pendingUsage) yield { type: "usage", usage: pendingUsage };
  const reason = pendingFinish ?? { kind: "stop" as const };
  yield {
    type: "finish",
    reason:
      reason.kind === "stop" && blocks.length === 0
        ? {
            kind: "error",
            failure: {
              message: "model returned a completed response with no content",
              code: EMPTY_RESPONSE_CODE,
            },
          }
        : reason,
  };
}
