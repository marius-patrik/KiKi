/**
 * `automations`: the abstraction/extension-point plugin for repository
 * automations. It mounts exactly one thing — the {@link AutomationsRegistry}
 * service — and deliberately contributes no automation of its own.
 *
 * Every concrete repository automation is its own extension package plugging
 * into this registry: autoreview, autofix, auto-doc, and the GitHub agent from
 * #52 each register an {@link Automation} from their own `apply(ctx)` rather
 * than being bundled here. Keeping this package a pure registry is what stops
 * `automations` from becoming an umbrella plugin that owns several unrelated
 * concrete features.
 * @module automations
 */

import type { Context } from "@deepseek-ai/cordis";
import { AutomationsRegistry } from "./registry.js";

export { AutomationsRegistry } from "./registry.js";
export type {
  Automation,
  AutomationOutcome,
  AutomationRunRequest,
  AutomationTrigger,
} from "./automation.js";

export const name = "automations";
export const inject: string[] = [];

/** Mount the automations registry so automation extensions can plug into it. */
export function apply(ctx: Context): void {
  new AutomationsRegistry(ctx);
}
