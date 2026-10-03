/**
 * `tweak-fork-undo`: fork-based session undo/redo — the `/undo` `/redo`
 * commands plus their `tweak-fork-undo` settings section. Split out of the
 * bundled `tweaks` package.
 * @module tweak-fork-undo
 */

import type { Context } from "@deepseek-ai/cordis";
import type z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { installForkUndo } from "./fork-undo.js";
import { ForkUndoConfig, type ForkUndoConfig as ForkUndoConfigType } from "./settings.js";

export { NS_FORK_UNDO, ForkUndoConfig } from "./settings.js";
export type { ForkUndoConfig as ForkUndoConfigType } from "./settings.js";
export { forkSession, installForkUndo } from "./fork-undo.js";

export const name = "tweak-fork-undo";
export const inject: string[] = [];

/** The fork-undo extension config: the fork-undo section itself. */
export type Config = ForkUndoConfigType;

export const Config: z<Config> = ForkUndoConfig;

/**
 * Declares this plugin's own settings page and installs the fork-undo commands.
 *
 * Since 0.2.0 no form is registered: the settings service projects the volatile
 * Config fields of the active profile's entries, so this plugin's own
 * `ForkUndoConfig` is its form and its namespace is this plugin's entry id. All
 * this plugin must declare is that it ships its own page for that form. The
 * `/undo` `/redo` commands are then registered only when `config.enabled` is
 * true.
 *
 * @param ctx - The context in which to declare the settings page and install the commands.
 * @param config - The fork-undo config; `enabled` gates the command registration.
 */
export function apply(ctx: Context, config: Config): void {
  const session: ForkUndoConfigType = { enabled: config?.enabled ?? true };
  declareCustomSettingsPage(ctx);
  if (session.enabled) void installForkUndo(ctx);
}
