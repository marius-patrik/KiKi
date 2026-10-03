/**
 * `lsp`: owns the LSP capability on the web profile. The harness ships the
 * LSP service definition (`ctx.lsp`), a generic stdio provider
 * (`dsh-lsp-stdio`), and a model-facing `lsp` tool (`dsh-tool-lsp`) — but
 * composes none of them by default, and its LSP operation set is a closed
 * compile-time union (no formatting: that is `formatters`' job). This
 * plugin mounts the trio through `ctx.plugin` and feeds the stdio provider
 * the server table this plugin's own Config carries, so the agent's
 * `goToDefinition`/`findReferences`/`goToImplementation`/`hover` queries work
 * out of the box. The `dsh lsp` CLI (bin/lsp.mjs) manages the table; changes
 * apply on the next boot (mounts are boot-time, not hot-reloaded).
 * @module lsp
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import Lsp from "@deepseek-ai/dsh-lsp";
import * as LspStdio from "@deepseek-ai/dsh-lsp-stdio";
import * as ToolLsp from "@deepseek-ai/dsh-tool-lsp";
import { LspConfig } from "./settings.js";

export type * from "./settings.js";

export const name = "lsp";
export const inject: string[] = [];

export const Config: z<LspConfig> = LspConfig;

/**
 * Mount the LSP service definition, the stdio provider (only when at least one
 * server is configured — `lsp-stdio` refuses an empty table), and the
 * model-facing tool.
 *
 * Since 0.2.0 there is no separate settings section to read: this plugin's
 * `Config` is the `lsp` form the settings service projects, under this entry's
 * own id as its namespace, so `config.servers` is the one server table — entry
 * values and profile edits alike arrive through it. The mounts stay boot-time,
 * so a table edited after boot takes effect on the next boot, the same
 * contract the `dsh lsp` CLI documents.
 *
 * @param ctx - the plugin context.
 * @param config - the plugin's live configuration, carrying the LSP server table.
 */
export function apply(ctx: Context, config: LspConfig): void {
  declareCustomSettingsPage(ctx);

  ctx.inject(["settings"], async () => {
    const servers = config.servers ?? {};

    if (ctx.get("lsp") === undefined) {
      await ctx.plugin(Lsp);
    }

    if (Object.keys(servers).length > 0) {
      await ctx.plugin(LspStdio, { servers });
      await ctx.plugin(ToolLsp, {});
      ctx.logger.info(`lsp: mounted ${Object.keys(servers).length} LSP server(s)`);
    } else {
      ctx.logger.warn("lsp: no LSP servers configured — run `dsh lsp servers add <id> <command>`");
    }
  });
}
