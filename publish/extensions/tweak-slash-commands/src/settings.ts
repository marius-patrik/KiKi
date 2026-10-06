/**
 * tweak-slash-commands settings: the config-file slash-command registry
 * section schema.
 * @module tweak-slash-commands/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Namespace of the slash-command registry section — this plugin's own Loader entry id. */
export const NS_COMMANDS = settingsNamespace("tweak-slash-commands");

/** One config-file slash command: name + fixed response (echo/hint bridge). */
export interface CommandEntry {
  /** Lowercase command name without the leading slash. */
  name: string;
  /** Human-readable summary. */
  description: string;
  /** The exact text the command answers with (a templated reply). */
  reply: string;
}

export const CommandEntry: z<CommandEntry> = z.object({
  name: z.string(),
  description: z.string(),
  reply: z.string(),
});

/** The commands registry section: a list of config-file commands. */
export interface CommandsConfig {
  enabled: boolean;
  commands: CommandEntry[];
}

export const CommandsConfig: z<CommandsConfig> = z.object({
  enabled: z.boolean().default(true),
  commands: z.array(CommandEntry).default([]),
});
