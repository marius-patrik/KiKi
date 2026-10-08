/**
 * dialect-openai: the OpenAI-compatible wire dialect extension. Registers
 * itself into the `@dsh-stack/dialects` registry — the dialect abstraction
 * every wire-format extension plugs into.
 *
 * @module dialect-openai
 */

import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import "@dsh-stack/dialects";
import { openaiDialect } from "./openai.js";

export { openaiDialect, serializeMessages } from "./openai.js";
export { translateOpenAi, mapFinishReason, mapUsage } from "./translate-openai.js";

// jscpd:ignore-start -- structural: every dialect extension registers into the shared dialects registry with the same name/inject/Config/apply pattern, following the pattern already used repo-wide for one-extension-per-feature registrations (dsh-stack#135)
export const name = "dialect-openai";
export const inject = ["dialects"];

/** dialect-openai configuration; empty — the dialect is built in. */
export interface Config {}

/** Schemastery configuration for the plugin. */
export const Config: z<Config> = z.object({});

/** apply implementation. */
export function apply(ctx: Context, _config: Config): void {
  ctx.effect(() => {
    ctx.dialects.register(openaiDialect);
    return () => ctx.dialects.unregister(openaiDialect.id);
  });
}
// jscpd:ignore-end
