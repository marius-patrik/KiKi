/**
 * SSE framing helpers. `parseSseEvents` handles event-typed framings like
 * Anthropic's that end on EOF with no sentinel; `parseSseData` handles the
 * OpenAI-compatible framing with a terminal `[DONE]` payload, where truncation
 * (EOF before the sentinel) is a broken response and throws.
 *
 * @module dialects/sse
 */

import { EventSourceParserStream } from "eventsource-parser/stream";
import { LlmError } from "@deepseek-ai/dsh-llm";

/** The terminal payload OpenAI-compatible servers send after the last chunk. */
export const DONE = "[DONE]";

/** One parsed SSE event. */
export interface SseEvent {
  /** The event field; empty when the server sent a bare data payload. */
  event: string;
  /** The data payload. */
  data: string;
}

/**
 * Parse an SSE byte stream into event/data pairs, ending on EOF. Framing —
 * chunk reassembly, UTF-8/CRLF/BOM handling, comment and non-data field
 * skipping, multi-`data:` joining — is `eventsource-parser`'s. Comments are
 * reported only through an optional transport-activity callback.
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded stream.
 * @returns each event in arrival order.
 */
export async function* parseSseEvents(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator<SseEvent> {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }));
  for await (const event of events) {
    yield { event: event.event ?? "", data: event.data };
  }
}

/**
 * Parse an SSE byte stream into data payloads with the OpenAI-compatible
 * `[DONE]` sentinel. Yields `[DONE]` as the final value and returns; throws
 * `LlmError('STREAM_CLOSED')` when the stream ends without it (truncated
 * response — the model call cannot be trusted).
 * @param stream - raw SSE bytes.
 * @param onComment - optional transport-activity callback.
 * @returns each event's data payload in arrival order, the `[DONE]` sentinel last.
 */
export async function* parseSseData(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator<string> {
  for await (const { data } of parseSseEvents(stream, onComment)) {
    yield data;
    if (data === DONE) return;
  }
  throw new LlmError("SSE stream ended without [DONE]", "STREAM_CLOSED");
}
