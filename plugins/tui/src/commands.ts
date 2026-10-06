/**
 * Slash command handlers for dsh-tui.
 *
 * Commands map 1:1 to dsh RPC methods. Each command parses its arguments,
 * calls the appropriate RPC method, and returns a display string.
 *
 * @module dsh-tui/commands
 */

import type { DshClient } from "./client.js";

export interface CommandContext {
  client: DshClient;
  sessionId: string | null;
  sessionLabel: string;
  setSessionId: (id: string) => void;
  setModelLabel: (label: string) => void;
  setSessionLabel: (label: string) => void;
}

export interface CommandResult {
  text: string;
  /** If set, the TUI should switch to this session. */
  newSessionId?: string;
  /** If true, exit the TUI. */
  exit?: boolean;
}

/** Split a command's raw argument string into whitespace-separated tokens. */
function splitCommandArgs(args: string): string[] {
  return args.trim().split(/\s+/);
}

/** The result returned by every per-session command invoked with no active session. */
const NO_ACTIVE_SESSION_RESULT: CommandResult = {
  text: "no active session — create one first with /session new",
};

export interface Command {
  name: string;
  description: string;
  usage: string;
  handler: (args: string, ctx: CommandContext) => Promise<CommandResult>;
}

/* -------------------------------------------------------------------------- */
/* Command implementations                                                     */
/* -------------------------------------------------------------------------- */

const helpCommand: Command = {
  name: "/help",
  description: "Show available commands",
  usage: "/help [command]",
  handler: async (args, ctx) => {
    if (args.trim().length > 0) {
      const name = args.trim().split(/\s+/)[0];
      const cmd = commands.find((c) => c.name === name);
      if (cmd) {
        return { text: `${cmd.name} — ${cmd.description}\nusage: ${cmd.usage}` };
      }
      return { text: `unknown command: ${name}` };
    }
    const lines = commands.map((c) => `  ${c.name.padEnd(16)} ${c.description}`);
    return { text: `available commands:\n${lines.join("\n")}` };
  },
};

const sessionCommand: Command = {
  name: "/session",
  description: "List, create, or switch sessions",
  usage: "/session [list|new|switch <id>|info]",
  handler: async (args, ctx) => {
    const parts = splitCommandArgs(args);
    const action = parts[0] ?? "list";

    switch (action) {
      case "list": {
        const result = await ctx.client.call<{
          sessions: Array<{ id: string; title: string; model?: string; updatedAt: string }>;
        }>("session.list", {});
        const sessions = result.sessions ?? [];
        if (sessions.length === 0) return { text: "no sessions found" };
        const lines = sessions.map((s) => {
          const marker = s.id === ctx.sessionId ? " ← current" : "";
          const model = s.model ? ` [${s.model}]` : "";
          return `  ${s.id.slice(0, 8)}  ${s.title}${model}${marker}`;
        });
        return { text: `sessions:\n${lines.join("\n")}` };
      }
      case "new": {
        const title = parts.slice(1).join(" ") || undefined;
        const result = await ctx.client.call<{ id: string; title: string }>(
          "session.create",
          title ? { title } : {},
        );
        ctx.setSessionId(result.id);
        ctx.setSessionLabel(result.title ?? result.id.slice(0, 8));
        return { text: `created session: ${result.title ?? result.id}`, newSessionId: result.id };
      }
      case "switch": {
        const id = parts[1];
        if (!id) return { text: "usage: /session switch <id>" };
        // Find the full id from session list
        const result = await ctx.client.call<{ sessions: Array<{ id: string; title: string }> }>(
          "session.list",
          {},
        );
        const match = result.sessions?.find((s) => s.id.startsWith(id));
        if (!match) return { text: `no session matching "${id}"` };
        ctx.setSessionId(match.id);
        ctx.setSessionLabel(match.title ?? match.id.slice(0, 8));
        return { text: `switched to: ${match.title ?? match.id}`, newSessionId: match.id };
      }
      case "info": {
        if (!ctx.sessionId) return { text: "no active session" };
        return { text: `active session: ${ctx.sessionId}\nlabel: ${ctx.sessionLabel}` };
      }
      default:
        return { text: `unknown action: ${action}\nusage: /session [list|new|switch <id>|info]` };
    }
  },
};

const modelCommand: Command = {
  name: "/model",
  description: "List or switch models",
  // jscpd:ignore-start -- internal near-duplicate command-parsing blocks for two distinct commands
  usage: "/model [list|switch <id>]",
  handler: async (args, ctx) => {
    const parts = splitCommandArgs(args);
    const action = parts[0] ?? "list";

    if (!ctx.sessionId) return NO_ACTIVE_SESSION_RESULT;

    switch (action) {
      case "list": {
        const result = await ctx.client.call<{
          // jscpd:ignore-end
          models: Array<{ id: string; name: string; provider: string }>;
        }>("session.models", { sessionId: ctx.sessionId });
        const models = result.models ?? [];
        if (models.length === 0) return { text: "no models available" };
        const lines = models.map((m) => `  ${m.id}  ${m.name} (${m.provider})`);
        return { text: `models:\n${lines.join("\n")}` };
      }
      case "switch": {
        const modelId = parts[1];
        if (!modelId) return { text: "usage: /model switch <id>" };
        await ctx.client.call("session.selectModel", { sessionId: ctx.sessionId, modelId });
        ctx.setModelLabel(modelId);
        return { text: `switched model to: ${modelId}` };
      }
      default:
        return { text: `unknown action: ${action}\nusage: /model [list|switch <id>]` };
    }
  },
};

const goalCommand: Command = {
  name: "/goal",
  description: "Manage persistent goals (via dsh harness)",
  // jscpd:ignore-start -- internal near-duplicate command-parsing blocks for two distinct commands
  usage: "/goal [list|create <title>|pause|resume|clear]",
  handler: async (args, ctx) => {
    const parts = splitCommandArgs(args);
    const action = parts[0] ?? "list";

    if (!ctx.sessionId) return NO_ACTIVE_SESSION_RESULT;

    switch (action) {
      case "list": {
        // Goals are per-session; read via history or a dedicated endpoint
        const result = await ctx.client.call<{
          // jscpd:ignore-end
          goals?: Array<{ id: string; title: string; status: string }>;
        }>("goal.list", { sessionId: ctx.sessionId });
        const goals = result.goals ?? [];
        if (goals.length === 0) return { text: "no active goals" };
        const lines = goals.map((g) => `  ${g.status.padEnd(10)} ${g.title}`);
        return { text: `goals:\n${lines.join("\n")}` };
      }
      case "create": {
        const title = parts.slice(1).join(" ");
        if (!title) return { text: "usage: /goal create <title>" };
        const result = await ctx.client.call<{ id: string; title: string }>("goal.create", {
          sessionId: ctx.sessionId,
          title,
        });
        return { text: `goal created: ${result.title ?? title}` };
      }
      case "pause": {
        await ctx.client.call("goal.pause", { sessionId: ctx.sessionId });
        return { text: "goal paused" };
      }
      case "resume": {
        await ctx.client.call("goal.resume", { sessionId: ctx.sessionId });
        return { text: "goal resumed" };
      }
      case "clear": {
        await ctx.client.call("goal.clear", { sessionId: ctx.sessionId });
        return { text: "goals cleared" };
      }
      default:
        return {
          text: `unknown action: ${action}\nusage: /goal [list|create <title>|pause|resume|clear]`,
        };
    }
  },
};

const cancelCommand: Command = {
  name: "/cancel",
  description: "Cancel the active turn",
  usage: "/cancel",
  handler: async (_args, ctx) => {
    if (!ctx.sessionId) return { text: "no active session" };
    await ctx.client.call("session.cancel", { sessionId: ctx.sessionId });
    return { text: "turn cancelled" };
  },
};

const exitCommand: Command = {
  name: "/exit",
  description: "Exit dsh-tui",
  usage: "/exit",
  handler: async () => ({ text: "goodbye", exit: true }),
};

const quitCommand: Command = {
  name: "/quit",
  description: "Exit dsh-tui",
  usage: "/quit",
  handler: async () => ({ text: "goodbye", exit: true }),
};

/* -------------------------------------------------------------------------- */
/* Command registry                                                             */
/* -------------------------------------------------------------------------- */

export const commands: Command[] = [
  helpCommand,
  sessionCommand,
  modelCommand,
  goalCommand,
  cancelCommand,
  exitCommand,
  quitCommand,
];

/** Look up a command by name (with or without leading /). */
export function findCommand(input: string): { command: Command; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);
  const cmd = commands.find((c) => c.name === name);
  return cmd ? { command: cmd, args } : null;
}
