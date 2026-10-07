/**
 * Provider wire dialect contracts: the boundary between the harness
 * vocabulary and a provider wire protocol. Dialects are stateless; adapters
 * resolve credentials, assemble base URLs, and call {@link Dialect.serialize}
 * and {@link Dialect.parse}.
 *
 * @module dialects/types
 */

import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";

/** Stable wire protocol identifiers carried by the registry. */
export type DialectId = "openai" | "claude" | "gemini" | "code-assist" | "antigravity";

/**
 * Credential material for one wire request. Adapters resolve values from the
 * credentials seam and fill only what their route needs.
 */
export interface DialectAuth {
  /** OAuth bearer token for the request. */
  token?: string;
  /** API key for the request. */
  apiKey?: string;
  /** Cookie material for browser-backed subscription routes. */
  cookies?: Record<string, string>;
  /** Extra headers merged into the request (route-specific or override). */
  headers?: Record<string, string>;
}

/**
 * Route-level wire defaults an adapter supplies for one dialect use.
 */
export interface DialectDefaults {
  /** Output cap materialized when the caller omitted `maxTokens`. */
  maxTokens: number;
  /** Extra request-body fields merged verbatim (provider-specific toggles). */
  extra?: Record<string, unknown>;
}

/** A fully assembled provider wire request. */
export interface WireRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  /** Response framing: SSE or NDJSON. */
  framing: "sse" | "ndjson";
}

/**
 * One provider wire dialect: request serialization and stream translation
 * between the harness vocabulary and a provider protocol.
 */
export interface Dialect {
  /** Stable id used to look the dialect up in the registry. */
  readonly id: DialectId;
  /**
   * Assemble the wire request for one model call.
   * @param options - the harness request.
   * @param auth - resolved credential material.
   * @param baseURL - route base URL (OpenAI/Claude) or full endpoint (Gemini).
   * @param defaults - route wire defaults.
   * @returns the assembled POST request.
   */
  serialize(
    options: GenerateOptions,
    auth: DialectAuth,
    baseURL: string,
    defaults: DialectDefaults,
  ): WireRequest;
  /**
   * Translate a provider response stream into harness chunks.
   * @param body - the 2xx response body stream.
   * @param onActivity - optional transport-activity callback for raw lines.
   * @returns the translated chunk stream.
   */
  parse(
    body: ReadableStream<BufferSource>,
    onActivity?: (line: string) => void,
  ): AsyncIterable<StreamChunk>;
}
