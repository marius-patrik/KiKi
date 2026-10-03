/**
 * tweak-fork-undo: fork-based undo/redo. `/undo` `/redo` fork a new session
 * from an earlier logged boundary via `ctx.sessions.create`.
 * @module tweak-fork-undo/fork-undo
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-commands";
import type { SessionEvent } from "@deepseek-ai/dsh-session";

/** Register the fork-based `/undo` and `/redo` commands. Returns the inject fiber. */
export function installForkUndo(ctx: Context): unknown {
  return ctx.inject(["commands", "sessions"], (commandCtx) => {
    const disposers: (() => void)[] = [];
    /**
     * Registers commands to fork sessions in either direction (-1 for undo, 1 for redo).
     *
     * @param name - The name of the command.
     * @param description - A description of the command's purpose.
     * @param direction - Direction to fork the session (-1 for undo, 1 for redo).
     *
     * @returns Nothing on success, disposes of command registration on failure.
     */
    const make = (name: string, description: string, direction: -1 | 1): void => {
      disposers.push(
        commandCtx.commands.register({
          name,
          description,
          handler: (invocation) => forkSession(commandCtx.sessions, invocation.agent, direction),
        }),
      );
    };
    make("undo", "Fork this session from the previous message boundary", -1);
    make("redo", "Fork this session from the latest message boundary", 1);
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
}

/** Fork a new session from an earlier/later message boundary in the log. */
export function forkSession(
  sessions: { create(id?: string, options?: { seed?: readonly SessionEvent[] }): unknown },
  agent: { session: { snapshotEvents(): readonly SessionEvent[] } },
  direction: -1 | 1,
): { kind: "success"; text: string } | { kind: "error"; text: string } {
  const events = agent.session.snapshotEvents();
  if (events.length === 0) return { kind: "error", text: "no events to fork from" };
  const boundaries: number[] = [];
  events.forEach((event, index) => {
    if (event.type === "user/message") boundaries.push(index);
  });
  const target =
    direction === -1
      ? boundaries.length > 0
        ? boundaries[boundaries.length - 1]
        : 0
      : events.length;
  const seed = events.slice(0, target);
  sessions.create(undefined, { seed });
  return {
    kind: "success",
    text: `${direction === -1 ? "undo" : "redo"}: forked ${seed.length} events into a new session`,
  };
}
