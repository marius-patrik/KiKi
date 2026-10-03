/**
 * lsp settings: the `lsp` entry owns the LSP server table. The plugin mounts
 * the harness LSP capability (service definition, the stdio provider with this
 * table, and the model-facing `lsp` tool) on the web profile, so
 * `goToDefinition`/`findReferences`/`goToImplementation`/`hover` work for the
 * agent without touching the pristine harness.
 *
 * Since 0.2.0 there is no second section schema to register: this plugin's own
 * `Config` is the form the settings service projects, and its namespace is this
 * entry's own id. So one schema, `LspConfig`, carries both roles.
 * @module lsp/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";
import type { LspLocalServerConfig } from "@deepseek-ai/dsh-lsp-stdio";

/** Namespace of the LSP server table — this plugin's own Loader entry id. */
export const NS = settingsNamespace("lsp");

/** One stdio language server the plugin mounts through `dsh-lsp-stdio`. */
export type LspServerEntry = LspLocalServerConfig;

const LspServerEntry: z<LspServerEntry> = z.object({
  command: z.string().required(),
  extensionToLanguage: z.dict(String).required(),
  args: z.array(String).default([]),
  env: z.dict(String).default({}),
  initializationOptions: z.any().default(null),
  configuration: z.any().default(null),
  maxMessageBytes: z.number().default(16_000_000),
  maxStderrBytes: z.number().default(1_000_000),
  maxDocumentBytes: z.number().default(4_000_000),
  shutdownTimeoutMs: z.number().default(5_000),
  killGraceMs: z.number().default(2_000),
});

/** The plugin's configuration — and, since 0.2.0, its own settings form. */
export interface LspConfig {
  /** Provider id → stdio server configuration mounted through `dsh-lsp-stdio`. */
  servers: Record<string, LspServerEntry>;
}

export const LspConfig: z<LspConfig> = z.object({
  servers: z.dict(LspServerEntry).default({}),
});
