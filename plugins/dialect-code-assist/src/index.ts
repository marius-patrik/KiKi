/**
 * dialect-code-assist: the Google Code Assist wire dialect extension.
 * Registers itself into the `@dsh-stack/dialects` registry — the dialect
 * abstraction every wire-format extension plugs into. Wraps
 * `@dsh-stack/dialect-gemini`'s serialization (Code Assist is a JSON wrapper
 * over the same Gemini `GenerateContent` vocabulary).
 *
 * @module dialect-code-assist
 */

import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import "@dsh-stack/dialects";
import { codeAssistDialect } from "./code-assist.js";

export { codeAssistDialect } from "./code-assist.js";

// jscpd:ignore-start -- structural: every dialect extension registers into the shared dialects registry with the same name/inject/Config/apply pattern, following the pattern already used repo-wide for one-extension-per-feature registrations (dsh-stack#135)
export const name = "dialect-code-assist";
export const inject = ["dialects"];

/** dialect-code-assist configuration; empty — the dialect is built in. */
export interface Config {}

/** Schemastery configuration for the plugin. */
export const Config: z<Config> = z.object({});

/** apply implementation. */
export function apply(ctx: Context, _config: Config): void {
  ctx.effect(() => {
    ctx.dialects.register(codeAssistDialect);
    return () => ctx.dialects.unregister(codeAssistDialect.id);
  });
}
// jscpd:ignore-end
