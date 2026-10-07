/**
 * Terminal UI rendering for dsh-tui.
 *
 * Uses plain readline + ANSI escape codes. No external dependencies.
 * The TUI shows:
 *   - A status bar with session/model/connection info
 *   - Streaming assistant text as it arrives
 *   - A prompt for user input
 *
 * @module dsh-tui/tui
 */

import readline from "node:readline";
import process from "node:process";

/* -------------------------------------------------------------------------- */
/* ANSI helpers                                                                */
/* -------------------------------------------------------------------------- */

const ESC = "\x1b";
const CSI = `${ESC}[`;

export const ansi = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  fg: {
    red: `${CSI}31m`,
    green: `${CSI}32m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
  },
  bg: {
    blue: `${CSI}44m`,
    gray: `${CSI}100m`,
  },
  clearLine: `${CSI}2K`,
  cursorUp: (n = 1) => `${CSI}${n}A`,
  cursorDown: (n = 1) => `${CSI}${n}B`,
  cursorForward: (n = 1) => `${CSI}${n}C`,
  cursorBack: (n = 1) => `${CSI}${n}D`,
  cursorTo: (col: number, row: number) => `${CSI}${row};${col}H`,
  eraseBelow: `${CSI}0J`,
  saveCursor: `${ESC}7`,
  restoreCursor: `${ESC}8`,
};

/* -------------------------------------------------------------------------- */
/* TUI State                                                                   */
/* -------------------------------------------------------------------------- */

export interface TuiState {
  /** Current session id. */
  sessionId: string | null;
  /** Current session title or id. */
  sessionLabel: string;
  /** Current model name. */
  modelLabel: string;
  /** Connection status. */
  connected: boolean;
  /** Whether an assistant response is streaming. */
  streaming: boolean;
  /** Accumulated assistant text for the current turn. */
  streamBuffer: string;
  /** Whether the user is in a command prompt (e.g. /goal). */
  commandMode: boolean;
}

/**
 * Initializes the initial state of the application.
 *
 * Returns an object representing the initial state with session and model labels,
 * connection and streaming status, and other related flags set to default values.
 *
 * Fails if the function is called with invalid parameters (none expected).
 */
export function createInitialState(): TuiState {
  return {
    sessionId: null,
    sessionLabel: "(no session)",
    modelLabel: "(no model)",
    connected: false,
    streaming: false,
    streamBuffer: "",
    commandMode: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                    */
/* -------------------------------------------------------------------------- */

/** Render the status bar line. */
function renderStatusBar(state: TuiState): string {
  const connDot = state.connected
    ? `${ansi.fg.green}●${ansi.reset}`
    : `${ansi.fg.red}○${ansi.reset}`;
  const streamTag = state.streaming ? ` ${ansi.fg.yellow}streaming${ansi.reset}` : "";
  return `${ansi.bg.gray}${ansi.fg.white} ${connDot} ${state.sessionLabel} ${ansi.dim}│${ansi.reset} ${state.modelLabel}${streamTag}${ansi.eraseBelow}`;
}

/** Render the accumulated assistant text (trailing portion visible on screen). */
function renderStreamBuffer(state: TuiState): string {
  if (state.streamBuffer.length === 0) return "";
  // Show the last N lines that fit on screen (rough heuristic: 20 lines)
  const lines = state.streamBuffer.split("\n");
  const tail = lines.slice(-20);
  return tail.join("\n");
}

/** Full render: clear and redraw the visible area. */
export function render(io: readline.Interface, state: TuiState): void {
  // Move to top of our output area and redraw
  process.stdout.write(`${ansi.saveCursor}`);
  process.stdout.write(`${ansi.cursorUp(3)}\r`);
  process.stdout.write(renderStatusBar(state) + "\n");

  const stream = renderStreamBuffer(state);
  if (stream.length > 0) {
    process.stdout.write(stream + "\n");
  } else {
    process.stdout.write(`${ansi.dim}(type a message or /help for commands)${ansi.reset}\n`);
  }
  process.stdout.write(`${ansi.eraseBelow}`);
  process.stdout.write(`${ansi.restoreCursor}`);
}

/** Print a line to the output area (above the prompt). */
export function println(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** Print an error message. */
export function printError(text: string): void {
  process.stdout.write(`${ansi.fg.red}error: ${text}${ansi.reset}\n`);
}

/** Print an info message. */
export function printInfo(text: string): void {
  process.stdout.write(`${ansi.fg.cyan}${text}${ansi.reset}\n`);
}

/** Print a success message. */
export function printSuccess(text: string): void {
  process.stdout.write(`${ansi.fg.green}${text}${ansi.reset}\n`);
}

/** Clear the screen and reset cursor. */
export function clearScreen(): void {
  process.stdout.write(`${CSI}2J${CSI}1;1H`);
}
