/**
 * `tweak-stats`: session observability — the `tweaks-stats` settings section
 * plus the projection-cache readers powering the `dsh stats` and
 * `dsh sessions` verbs (bin/). Split out of the bundled `tweaks` package.
 * @module tweak-stats
 */

import type { Context } from "@deepseek-ai/cordis";
import type z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { StatsConfig, type StatsConfig as StatsConfigType } from "./settings.js";

export { NS_STATS, StatsConfig } from "./settings.js";
export type { StatsConfig as StatsConfigType } from "./settings.js";
export * from "./stats.js";

export const name = "tweak-stats";
export const inject: string[] = [];

/** The stats extension config: the stats section itself. */
export type Config = StatsConfigType;

export const Config: z<Config> = StatsConfig;

/**
 * Declare this plugin's settings surface as its own page.
 *
 * The stats form is the `StatsConfig` this plugin already declares, and its
 * namespace is this plugin's entry id, so there is nothing to install. The CLI
 * verbs in bin/ read the projection cache directly, so no server wiring is
 * needed either.
 *
 * @param ctx - the calling plugin's context.
 * @param config - the stats section: whether the verbs are enabled and the output format.
 */
export function apply(ctx: Context, config: Config): void {
  declareCustomSettingsPage(ctx);
}
