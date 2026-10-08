/**
 * dialect-claude: the Anthropic Claude wire dialect extension. Registers
 * itself into the `@dsh-stack/dialects` registry — the dialect abstraction
 * every wire-format extension plugs into.
 *
 * @module dialect-claude
 */

import { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import "@dsh-stack/dialects";
import { claudeDialect } from "./claude.js";

export { claudeDialect } from "./claude.js";
export { translateClaude, mapClaudeFinishReason, mapClaudeUsage } from "./translate-claude.js";

// jscpd:ignore-start -- structural: every dialect extension registers into the shared dialects registry with the same name/inject/Config/apply pattern, following the pattern already used repo-wide for one-extension-per-feature registrations (dsh-stack#135)
export const name = "dialect-claude";
export const inject = ["dialects"];

/** dialect-claude configuration; empty — the dialect is built in. */
export interface Config {}

/** Schemastery configuration for the plugin. */
export const Config: z<Config> = z.object({});

/** apply implementation. */
export function apply(ctx: Context, _config: Config): void {
  ctx.effect(() => {
    ctx.dialects.register(claudeDialect);
    return () => ctx.dialects.unregister(claudeDialect.id);
  });
}
// jscpd:ignore-end
