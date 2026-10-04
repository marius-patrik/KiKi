/**
 * NDJSON framing used by Gemini-style streaming: one JSON object per line.
 * Optional SSE `data: ` prefixes are tolerated so the same reader serves
 * `alt=sse` endpoints; a literal `[DONE]` payload terminates the stream.
 *
 * @module dialects/ndjson
 */

/** The terminal payload some NDJSON-compatible servers send after the last chunk. */
export const DONE = "[DONE]";

/**
 * Parse an NDJSON byte stream into JSON payload lines, ending on EOF.
 * @param stream - raw bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onLine - optional transport-activity callback receiving each raw line.
 * @returns each line's payload in arrival order; a `[DONE]` payload terminates the stream.
 */
export async function* parseNdjson(
  stream: ReadableStream<BufferSource>,
  onLine?: (line: string) => void,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length === 0) continue;
        const payload = line.startsWith("data:") ? line.slice(5).trimStart() : line;
        if (payload === DONE) return;
        if (payload.length > 0) {
          onLine?.(line);
          yield payload;
        }
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) {
      const payload = tail.startsWith("data:") ? tail.slice(5).trimStart() : tail;
      if (payload.length > 0) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}
