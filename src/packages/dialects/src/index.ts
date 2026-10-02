/**
 * dialects: the provider-wire-dialect abstraction as a harness plugin.
 * Registers the empty `ctx.dialects` registry; each concrete dialect
 * (`openai`, `claude`, `gemini`, `code-assist`, `antigravity`) is its own
 * extension package (`@dsh-stack/dialect-<id>`) that registers itself into
 * this registry. LLM adapter plugins (e.g. providers) resolve a dialect by
 * id to serialize requests and translate response streams.
 *
 * @module dialects
 */

import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { Dialect, DialectId } from "./types.js";

export type { Dialect, DialectAuth, DialectDefaults, DialectId, WireRequest } from "./types.js";
export type { DialectRequestMessages, RequestTurn } from "./request-messages.js";
export { splitRequestMessages } from "./request-messages.js";
export type { SseEvent } from "./sse.js";
export { DONE, parseSseData, parseSseEvents } from "./sse.js";
export { parseNdjson } from "./ndjson.js";

/**
 * The `dialects` service: a typed registry of provider wire dialects.
 * Registered automatically with the owning plugin fiber; dialect contributions
 * are HMR-safe through `ctx.effect` disposers.
 */
export class DialectRegistry extends Service {
  private readonly dialects = new Map<DialectId, Dialect>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "dialects");
  }

  /**
   * Register one dialect under its id. Throws on duplicate ids.
   * @param dialect - the dialect to register.
   */
  register(dialect: Dialect): void {
    if (this.dialects.has(dialect.id)) {
      throw new Error(`dialects: duplicate dialect "${dialect.id}"`);
    }
    this.dialects.set(dialect.id, dialect);
  }

  /**
   * Withdraw a dialect registration.
   * @param id - the dialect id to remove.
   */
  unregister(id: DialectId): void {
    this.dialects.delete(id);
  }

  /**
   * Resolve a dialect by id.
   * @param id - the dialect id.
   * @returns the dialect; throws when unknown.
   */
  get(id: DialectId): Dialect {
    const dialect = this.dialects.get(id);
    if (dialect === undefined) {
      throw new Error(`dialects: unknown dialect "${id}"`);
    }
    return dialect;
  }

  /** Every registered dialect, in registration order. */
  list(): readonly Dialect[] {
    return [...this.dialects.values()];
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    dialects: DialectRegistry;
  }
}

export const name = "dialects";
export const inject: never[] = [];

/** dialects configuration; empty — concrete dialects register from their own extension packages. */
export interface Config {}

/** Schemastery configuration for the plugin. */
export const Config: z<Config> = z.object({});

/** apply implementation. */
export function apply(ctx: Context, _config: Config): void {
  new DialectRegistry(ctx);
}
