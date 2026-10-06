/**
 * dialect-antigravity: the Antigravity Gemini wire dialect extension.
 * Registers itself into the `@dsh-stack/dialects` registry — the dialect
 * abstraction every wire-format extension plugs into.
 *
 * @module dialect-antigravity
 */

import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import "@dsh-stack/dialects";
import { antigravityDialect } from "./antigravity.js";

export { antigravityDialect, ANTIGRAVITY_PROJECT_HEADER } from "./antigravity.js";

// jscpd:ignore-start -- structural: every dialect extension registers into the shared dialects registry with the same name/inject/Config/apply pattern, following the pattern already used repo-wide for one-extension-per-feature registrations (dsh-stack#135)
export const name = "dialect-antigravity";
export const inject = ["dialects"];

/** dialect-antigravity configuration; empty — the dialect is built in. */
export interface Config {}

/** Schemastery configuration for the plugin. */
export const Config: z<Config> = z.object({});

/** apply implementation. */
export function apply(ctx: Context, _config: Config): void {
  ctx.effect(() => {
    ctx.dialects.register(antigravityDialect);
    return () => ctx.dialects.unregister(antigravityDialect.id);
  });
}
// jscpd:ignore-end
