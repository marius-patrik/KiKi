/**
 * lsp settings: the `lsp` entry owns the LSP server table. The plugin mounts
 * the harness LSP capability (service definition, the stdio provider with this
 * table, and the model-facing `lsp` tool) on the web profile, so
 * `goToDefinition`/`findReferences`/`goToImplementation`/`hover` work for the
 * agent without touching the pristine harness.
 *
 * Since 0.2.0 there is no second section schema to register: this plugin's own
 * `Config` is the form the settings service projects, and its namespace is this
 * entry's own id. So one schema, `LspConfig`, carries both roles. Which of its
 * fields that form shows is decided by volatility: the server table is the
 * user's choice — which language servers exist and how to launch them — so it is
 * declared `.volatile()`, and it is the whole of the table rather than just the
 * list of ids. The settings service only recurses into `object` schemas when it
 * projects a form, so a volatile marker nested inside the table's entries would
 * leave `servers` itself unprojected; marking the dictionary is what makes the
 * form exist, and it is what lets the user edit a server's command rather than
 * only add and remove ids.
 * @module lsp/settings
 */

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";
import type { LspLocalServerConfig } from "@deepseek-ai/dsh-lsp-stdio";

/** Namespace of the LSP server table — this plugin's own Loader entry id. */
export const NS = settingsNamespace("lsp");

/** One stdio language server the plugin mounts through `dsh-lsp-stdio`. */
export type LspServerEntry = LspLocalServerConfig;

export const LspServerEntry: z<LspServerEntry> = z.object({
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
  /**
   * Lowercase leading-dot extension → installed stdio server. Volatile because
   * the answer is machine-local: which language servers exist, under what ids and
   * with what commands, differs per workstation, so no deployment can pin one
   * correct table and the user owns it. It is volatile as one whole-dictionary
   * node — not a marker per table entry — because the settings service only
   * recurses into `object` schemas when it projects a form, and because a form
   * write can only address a path lying under a volatile node: a reference per
   * entry could be neither declared nor edited, and marking only the ids would
   * leave the command a client cannot correct.
   */
  servers: Volatile<Record<string, LspServerEntry>>;
}

/** What the server-table schema accepts before validation. */
export type LspServerInput = { servers: Record<string, LspServerEntry> };

/**
 * Not annotated `z<LspConfig>`: a volatile field's output type is `Volatile<T>`,
 * which `z<T>`'s invariant position cannot hold. The three-parameter schema
 * type is the annotation that can, and it is required rather than cosmetic —
 * left to inference, the nested `Volatile` inside this dictionary has no name
 * the declaration emitter can write (`TS2742`), and `themes`/`formatters` get
 * away with a bare `z.object({...})` only because their volatile fields are
 * scalar. `harness`'s own `llm-pi-ai` uses the same bare shape and builds with
 * a different declaration emitter.
 */
export const LspConfig: z<LspServerInput, LspConfig, "plain"> = z.object({
  servers: z.dict(LspServerEntry).default({}).volatile(),
});

/**
 * The servers currently installed for this entry, in the mutable shape
 * `dsh-lsp-stdio` declares.
 *
 * Reads the volatile field at call time, so a settings write is visible to the
 * next read rather than to a value captured at boot. `args` is copied because a
 * volatile snapshot is deeply frozen and the stdio provider's own Config declares
 * a mutable `string[]` there; the plain properties and index signatures need no
 * such copy, as TypeScript does not compare them for `readonly`.
 *
 * @param config - the plugin's projected Config.
 * @returns the installed server table, empty when none is configured.
 */
export function installedServers(config: LspConfig | undefined): Record<string, LspServerEntry> {
  return Object.fromEntries(
    Object.entries(config?.servers?.get() ?? {}).map(([id, entry]) => [
      id,
      { ...entry, args: [...(entry.args ?? [])] },
    ]),
  );
}
