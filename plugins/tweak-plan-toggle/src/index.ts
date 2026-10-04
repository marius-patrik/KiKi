/**
 * `tweak-plan-toggle`: the Plan/Build toggle command plus the settings form
 * projected from its own `tweak-plan-toggle` entry. Split out of the bundled
 * `tweaks` package.
 * @module tweak-plan-toggle
 */

import type { Context } from "@deepseek-ai/cordis";
import type z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { installPlanToggle } from "./plan-toggle.js";
import {
  NS_PLAN_TOGGLE,
  PlanToggleConfig,
  type PlanToggleConfig as PlanToggleConfigType,
} from "./settings.js";

export { NS_PLAN_TOGGLE, PlanToggleConfig } from "./settings.js";
export type { PlanToggleConfig as PlanToggleConfigType } from "./settings.js";
export { installPlanToggle } from "./plan-toggle.js";

export const name = "tweak-plan-toggle";
export const inject: string[] = [];

/** The plan-toggle extension config: the plan-toggle section itself. */
export type Config = PlanToggleConfigType;

export const Config: z<Config> = PlanToggleConfig;

/**
 * apply implementation.
 *
 * The plan-toggle form is the `PlanToggleConfig` this plugin already declares,
 * and its namespace is this plugin's entry id, so there is nothing to install.
 * What remains is to declare that this plugin ships its own page for that form
 * and, when enabled, to register the `/build` command that leaves plan mode.
 *
 * @param ctx - the plugin's context.
 * @param config - the plan-toggle configuration; `enabled` defaults to true.
 */
export function apply(ctx: Context, config: Config): void {
  const session: PlanToggleConfigType = { enabled: config?.enabled ?? true };
  declareCustomSettingsPage(ctx);
  if (session.enabled) void installPlanToggle(ctx);
}
