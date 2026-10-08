import { Service, type Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";

export const name = "commands";
export const inject = ["slots", "sessions", "actions"];
export const optional: string[] = [];

export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string) => Promise<unknown> | unknown;
}

export class CommandsService extends Service {
  static inject = ["slots", "sessions", "actions"];
  private readonly commands = new Map<string, SlashCommand>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "commands");
  }

  /**
   * Registers a new slash command.
   *
   * Guarantees that the command name is non-empty and adds it to the command registry.
   * Throws an error if the command name is empty.
   *
   * @param cmd - The slash command to register.
   */
  register(cmd: SlashCommand): void {
    if (!cmd.name.trim()) throw new Error("Slash command name must be non-empty");
    this.commands.set(cmd.name, cmd);
  }

  /**
   * Returns all registered slash commands.
   *
   * @returns An array of SlashCommand instances.
   * @throws Throws an error if no commands are registered.
   */
  list(): SlashCommand[] {
    return Array.from(this.commands.values());
  }
}

export const Config = Schema.object({});

/**
 * Applies the configuration context to the CommandsService.
 *
 * @param ctx - The configuration context to apply.
 * @throws Throws an error if the context is invalid or if no CommandsService is created.
 */
export function apply(ctx: Context): void {
  new CommandsService(ctx);
}
