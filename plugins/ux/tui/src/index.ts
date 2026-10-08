/**
 * Main entry point for dsh-tui.
 *
 * Connects to a running dsh harness over HTTP, starts the mux SSE stream,
 * and runs a readline REPL for the user to type messages and commands.
 *
 * Usage:
 *   dsh-tui [--url http://127.0.0.1:3080]
 *
 * @module dsh-tui/index
 */

import readline from "node:readline";
import process from "node:process";
import { DshClient, type DshClientConfig } from "./client.js";
import { type MuxFrame, type SessionEvent } from "./protocol.js";
import {
  type TuiState,
  createInitialState,
  render,
  println,
  printError,
  printInfo,
  printSuccess,
  clearScreen,
  ansi,
} from "./tui.js";
import { findCommand } from "./commands.js";

/* -------------------------------------------------------------------------- */
/* CLI arg parsing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Parses command-line arguments to set the URL.
 *
 * Guarantees the return of an object containing the URL.
 * If the `--url` argument is provided, it updates the URL to the specified value.
 * On failure, returns the default URL: "http://127.0.0.1:3080".
 *
 * @param argv - An array of command-line arguments.
 * @returns An object with the URL.
 */
function parseArgs(argv: string[]): { url: string } {
  let url = "http://127.0.0.1:3080";
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url" && i + 1 < argv.length) {
      i++;
      const next = argv[i];
      if (next !== undefined) url = next;
    }
  }
  return { url };
}

/* -------------------------------------------------------------------------- */
/* SSE frame handling                                                           */
/* -------------------------------------------------------------------------- */

/** handleMuxFrame implementation. */
function handleMuxFrame(frame: MuxFrame, state: TuiState, sessionId: string | null): void {
  // Only process frames for our active session
  const payload = frame.payload as Record<string, unknown>;
  const eventSessionId = (payload.sessionId ?? payload.session_id) as string | undefined;
  if (sessionId && eventSessionId && eventSessionId !== sessionId) return;

  switch (frame.method) {
    case "session/event": {
      const event = payload.event as SessionEvent | undefined;
      if (!event) break;
      handleSessionEvent(event, state);
      break;
    }
    case "session/subscribed": {
      // Baseline subscription confirmed
      break;
    }
    case "approval/requested":
    case "question/requested": {
      // These need user input — for now, print a notice
      const question = (payload.question ??
        payload.prompt ??
        "The harness is asking for input") as string;
      println(`${ansi.fg.magenta}[question] ${question}${ansi.reset}`);
      break;
    }
    case "stream/error": {
      const error = (payload.error ?? payload.message ?? "unknown error") as string;
      printError(`stream error: ${error}`);
      state.streaming = false;
      break;
    }
  }
}

/**
 * Handles different session events and updates the state accordingly.
 *
 * Guarantees:
 * - Sets `state.streaming` to true on "turn/start" event.
 * - Appends `event.content.text` to `state.streamBuffer` on "assistant/chunk" event.
 * - Sets `state.streaming` to false and logs an error on "stream/error" event.
 *
 * Fails:
 * - Logs an unknown error message if `event.content.text` is undefined on "assistant/chunk" event.
 */
function handleSessionEvent(event: SessionEvent, state: TuiState): void {
  switch (event.type) {
    case "turn/start": {
      state.streaming = true;
      state.streamBuffer = "";
      break;
    }
    case "assistant/chunk": {
      // Extract text from the chunk
      const content = event.content as Array<{ type: string; text?: string }> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            state.streamBuffer += block.text;
          }
        }
      }
      break;
    }
    case "assistant/message": {
      // Complete message — extract final text
      const content = event.content as Array<{ type: string; text?: string }> | undefined;
      if (content) {
        const text = content
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
        if (text.length > 0) {
          state.streamBuffer = text;
        }
      }
      state.streaming = false;
      break;
    }
    case "turn/end": {
      state.streaming = false;
      break;
    }
    case "tool/call": {
      const toolName = (event.name ?? event.tool ?? "tool") as string;
      println(`${ansi.dim}[tool] ${toolName}${ansi.reset}`);
      break;
    }
    case "tool/result": {
      // Tool result — just a dot indicator
      process.stdout.write(`${ansi.fg.green}.${ansi.reset}`);
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Main REPL loop                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Enters the main REPL loop, processing different event types to manage
 * streaming state and tool execution. Guarantees that the `state.streaming`
 * flag is set to false upon completion of any event type.
 *
 * On failure or reaching the end of the event processing, the function
 * exits the loop and resets the `state.streaming` flag.
 */
export async function main(): Promise<void> {
  const { url } = parseArgs(process.argv);

  const config: DshClientConfig = { baseUrl: url };
  const client = new DshClient(config);
  const state = createInitialState();

  // Set up readline
  const io = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${ansi.fg.cyan}> ${ansi.reset}`,
  });

  // Clear screen and show initial state
  clearScreen();
  println(`${ansi.bold}dsh-tui${ansi.reset} — standalone terminal client for the DeepSeek Harness`);
  println(`${ansi.dim}connecting to ${url}...${ansi.reset}`);

  // Test connection
  try {
    await client.call("host.describe", {});
    state.connected = true;
    println(`${ansi.fg.green}connected${ansi.reset}`);
  } catch (err) {
    println(`${ansi.fg.red}failed to connect: ${(err as Error).message}${ansi.reset}`);
    println(`${ansi.dim}make sure the harness is running: dsh --profile web${ansi.reset}`);
    io.close();
    client.destroy();
    process.exit(1);
  }

  // Try to list sessions and auto-select
  try {
    const result = await client.call<{
      sessions: Array<{ id: string; title: string; model?: string }>;
    }>("session.list", {});
    const sessions = result.sessions ?? [];
    const latest = sessions[0];
    if (latest !== undefined) {
      state.sessionId = latest.id;
      state.sessionLabel = latest.title ?? latest.id.slice(0, 8);
      state.modelLabel = latest.model ?? "(default model)";
    }
  } catch {
    // Session list might not be available yet — that's OK
  }

  // Subscribe to mux stream
  let unsubscribe: (() => void) | null = null;
  /**
   * Attempts to connect to the specified URL and subscribe to sessions.
   *
   * Guarantees connection to the specified URL and subscription to sessions if successful.
   * Fails and exits the process if the connection cannot be established.
   */
  const subscribeMux = () => {
    unsubscribe = client.subscribeMux(
      (frame) => handleMuxFrame(frame, state, state.sessionId),
      (err) => {
        println(`${ansi.fg.red}mux stream error: ${err.message}${ansi.reset}`);
        state.connected = false;
        // Attempt reconnect after 3 seconds
        setTimeout(() => {
          if (!state.connected) {
            println(`${ansi.dim}reconnecting...${ansi.reset}`);
            subscribeMux();
          }
        }, 3_000);
      },
    );
  };
  subscribeMux();

  // Show initial render
  render(io, state);
  io.prompt();

  // Handle input
  io.on("line", async (line: string) => {
    const input = line.trim();
    if (input.length === 0) {
      io.prompt();
      return;
    }

    // Check for slash commands
    const cmdMatch = findCommand(input);
    if (cmdMatch) {
      const ctx = {
        client,
        sessionId: state.sessionId,
        sessionLabel: state.sessionLabel,
        setSessionId: (id: string) => {
          state.sessionId = id;
        },
        setModelLabel: (label: string) => {
          state.modelLabel = label;
        },
        setSessionLabel: (label: string) => {
          state.sessionLabel = label;
        },
      };
      try {
        const result = await cmdMatch.command.handler(cmdMatch.args, ctx);
        if (result.text.length > 0) println(result.text);
        if (result.exit) {
          io.close();
          client.destroy();
          process.exit(0);
        }
      } catch (err) {
        printError((err as Error).message);
      }
      render(io, state);
      io.prompt();
      return;
    }

    // Regular message — send to session
    if (!state.sessionId) {
      // Create a session automatically
      try {
        const result = await client.call<{ id: string; title: string }>("session.create", {});
        state.sessionId = result.id;
        state.sessionLabel = result.title ?? result.id.slice(0, 8);
      } catch (err) {
        printError(`failed to create session: ${(err as Error).message}`);
        io.prompt();
        return;
      }
    }

    // Send message
    state.streaming = true;
    state.streamBuffer = "";
    try {
      await client.call("session.prompt", {
        sessionId: state.sessionId,
        mode: "queue",
        content: [{ type: "text", text: input }],
      });
    } catch (err) {
      printError(`failed to send: ${(err as Error).message}`);
      state.streaming = false;
    }

    // The response will arrive via SSE — render loop will update
    render(io, state);
    io.prompt();
  });

  // Handle close
  io.on("close", () => {
    unsubscribe?.();
    client.destroy();
    process.exit(0);
  });

  // Handle SIGINT
  process.on("SIGINT", () => {
    println(`${ansi.dim}^C — use /exit to quit${ansi.reset}`);
    io.prompt();
  });
}

export { DshClient } from "./client.js";
export type { DshClientConfig } from "./client.js";
export type {
  MuxFrame,
  ServerRequest,
  SessionDescriptor,
  SessionEvent,
  ModelDescriptor,
  GoalDescriptor,
} from "./protocol.js";
export { commands, findCommand } from "./commands.js";
export type { Command, CommandContext, CommandResult } from "./commands.js";
export {
  createInitialState,
  render,
  println,
  printError,
  printInfo,
  printSuccess,
  clearScreen,
  ansi,
} from "./tui.js";
