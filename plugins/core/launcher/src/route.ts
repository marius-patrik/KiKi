/** What the launcher should do with an argv, decided without side effects. */
export type RoutePlan =
  | { kind: "lifecycle"; action: "start" | "stop" | "restart" | "status" }
  | { kind: "logs"; follow: boolean; lines: number }
  | { kind: "attach"; lines: number; intervalMs: number }
  | { kind: "prune-worktrees" }
  | { kind: "verb"; verb: string; args: string[] }
  | { kind: "passthrough"; args: string[] };

/** Options shaping argv routing. */
export interface RouteOptions {
  /** basename of argv[1] — the `dsh-restart` alias restarts when bare. */
  invokedName: string;
  /** dsh-tweaks.command default command, word-split when argv is empty. */
  command?: string;
}

/**
 * Route an argv to a plan. Lifecycle verbs
 * (start/stop/restart/status/logs/attach) are owned here; package verbs (accounts/theme/lsp/formatter/agents) are
 * handed to their owning package CLIs; everything else passes through to the
 * harness CLI, exactly like the bash launcher.
 */
export function route(argv: string[], opts: RouteOptions): RoutePlan {
  let args = argv;
  if (opts.invokedName === "dsh-restart" && args.length === 0) args = ["restart"];
  const command = opts.command;
  if (args.length === 0 && command !== undefined && command.length > 0) {
    // Word-splitting is intentional: a settings command is an argv fragment.
    args = command.split(/\s+/).filter((word) => word.length > 0);
  }
  const verb = args[0];
  const rest = args.slice(1);
  switch (verb) {
    case "status":
    case "start":
    case "stop":
    case "restart":
      return { kind: "lifecycle", action: verb };
    case "logs":
    case "log":
      return { kind: "logs", ...parseLogsArgs(rest) };
    case "prune-worktrees":
      return { kind: "prune-worktrees" };
    case "attach":
      return { kind: "attach", ...parseAttachArgs(rest) };
    case "accounts":
    case "theme":
    case "lsp":
    case "formatter":
    case "agents":
      return { kind: "verb", verb, args: rest };
    default:
      return { kind: "passthrough", args };
  }
}

/**
 * Parse `dsh logs` arguments: `-f`/`--follow` to stream, `-n <lines>` for the
 * tail size (50 by default). Unknown flags are ignored, matching the bash
 * launcher's tolerant pass-through-to-tail behavior.
 */
export function parseLogsArgs(args: string[]): { follow: boolean; lines: number } {
  let follow = false;
  let lines = 50;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-f" || arg === "--follow") follow = true;
    else if (arg === "-n") {
      const parsed = Number(args[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0) {
        lines = parsed;
        i += 1;
      }
    }
  }
  return { follow, lines };
}

/**
 * Parse `dsh attach` arguments: `-n <lines>` for the backlog size, shared with
 * `dsh logs` (the attached view always streams, so `-f` is implied and
 * ignored), and `-i`/`--interval <seconds>` for the metrics poll cadence (five
 * seconds by default). Unknown flags are ignored, matching `dsh logs`.
 */
export function parseAttachArgs(args: string[]): { lines: number; intervalMs: number } {
  const { lines } = parseLogsArgs(args);
  let intervalMs = 5000;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg !== "-i" && arg !== "--interval") continue;
    const seconds = Number(args[i + 1]);
    if (Number.isFinite(seconds) && seconds > 0) intervalMs = Math.round(seconds * 1000);
  }
  return { lines, intervalMs };
}
