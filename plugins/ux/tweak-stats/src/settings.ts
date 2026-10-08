/**
 * tweak-stats settings: the observability section schema shared between the
 * composition entry, the settings document, and the stats/sessions verbs.
 * @module tweak-stats/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Namespace of the observability section — this plugin's own Loader entry id. */
export const NS_STATS = settingsNamespace("tweak-stats");

/** Observability knobs. */
export interface StatsConfig {
  /** Whether `dsh stats`/`dsh sessions` verbs are enabled. */
  enabled: boolean;
  /** Stats output format: `table`, `json`, or `csv`. */
  format: "table" | "json" | "csv";
}

export const StatsConfig: z<StatsConfig> = z.object({
  enabled: z.boolean().default(true),
  format: z.union([z.const("table"), z.const("json"), z.const("csv")]).default("table"),
});
