/**
 * tweak-slash-commands registry: validates config-file command entries and
 * bridges them into the harness command registry.
 * @module tweak-slash-commands/commands
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-commands";
import type { CommandEntry, CommandsConfig } from "./settings.js";

/** Validate a command entry (name shape + non-empty reply). */
export function validateCommand(entry: CommandEntry): void {
  if (!/^[a-z][a-z0-9_-]*$/.test(entry.name)) {
    throw new Error(
      `command name "${entry.name}" must be lowercase [a-z0-9_-] without a leading slash`,
    );
  }
  if (entry.reply.trim().length === 0)
    throw new Error(`command "${entry.name}" has an empty reply`);
}

/** Track the live config-command registrations so re-installs dispose first. */
let configuredCommandsDispose: (() => void) | undefined;

/** Register each config-file command through the harness command registry. */
export function installConfiguredCommands(ctx: Context, commands: CommandsConfig): void {
  configuredCommandsDispose?.();
  configuredCommandsDispose = undefined;
  if (!commands.enabled) return;
  ctx.inject(["commands"], (commandCtx) => {
    const disposers: (() => void)[] = [];
    for (const entry of commands.commands) {
      const reply = entry.reply;
      disposers.push(
        commandCtx.commands.register({
          name: entry.name,
          description: entry.description,
          handler: () => ({ kind: "success" as const, text: reply }),
        }),
      );
    }
    configuredCommandsDispose = () => {
      for (const dispose of disposers) dispose();
    };
    return configuredCommandsDispose;
  });
}
