/**
 * `tweak-slash-commands`: config-file slash commands — the `tweaks-commands`
 * settings section bridged into the harness command registry. Split out of
 * the bundled `tweaks` package.
 * @module tweak-slash-commands
 */

import type { Context } from "@deepseek-ai/cordis";
import type z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { installConfiguredCommands, validateCommand } from "./commands.js";
import {
  NS_COMMANDS,
  CommandsConfig,
  type CommandsConfig as CommandsConfigType,
} from "./settings.js";

export { NS_COMMANDS, CommandEntry, CommandsConfig } from "./settings.js";
export type {
  CommandEntry as CommandEntryType,
  CommandsConfig as CommandsConfigType,
} from "./settings.js";
export { installConfiguredCommands, validateCommand } from "./commands.js";

export const name = "tweak-slash-commands";
export const inject: string[] = [];

/** The slash-commands extension config: the commands section itself. */
export type Config = CommandsConfigType;

export const Config: z<Config> = CommandsConfig;

/**
 * apply implementation.
 *
 * The command form is the `CommandsConfig` this plugin already declares, and its
 * namespace is this plugin's entry id, so there is nothing to install. The
 * command invariants are checked here instead of on write: the settings service
 * validates a write against the schema alone, and a lowercase slash-free name or
 * a non-empty reply is a cross-entry rule no field schema can express.
 *
 * @param ctx - the calling plugin's context.
 * @param config - the active profile entry this plugin was applied with.
 * @throws {Error} if any command entry violates `validateCommand`.
 */
export function apply(ctx: Context, config: Config): void {
  const commands: CommandsConfigType = {
    enabled: config?.enabled ?? true,
    commands: config?.commands ?? [],
  };
  for (const command of commands.commands) validateCommand(command);
  declareCustomSettingsPage(ctx);
  installConfiguredCommands(ctx, commands);
}
