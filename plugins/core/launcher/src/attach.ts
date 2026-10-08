import { followLog } from "./logs.js";
import { fetchPluginInventory } from "./plugin-inventory.js";
import { formatPluginMetricsLine, summarizePluginMetrics } from "./plugin-metrics.js";

/** Inputs for one attached session. */
export interface AttachOptions {
  /** Port the running server was resolved to (never assumed — see ports.ts). */
  port: number;
  /** Resolved DSH_HOME, needed to authenticate the plugin-inventory RPC. */
  home: string;
  /** Active profile name, needed to authenticate the plugin-inventory RPC. */
  profile: string;
  /** Log file the background server writes to. */
  logFile: string;
  /** Lines of backlog printed before streaming starts. */
  lines: number;
  /** Delay between plugin-metrics polls, in milliseconds. */
  intervalMs: number;
  /** Sink for everything the attached view prints. */
  out: (text: string) => void;
}

/**
 * Give a live attached view of the running web server: the log backlog and
 * every appended line, interleaved with a plugin-metrics banner refreshed
 * every `intervalMs`. Ctrl-C detaches — the SIGINT handler stops the log
 * watcher and the poll timer and resolves, leaving the server running.
 */
export function attachToServer(opts: AttachOptions): Promise<void> {
  const { port, home, profile, logFile, lines, intervalMs, out } = opts;
  return new Promise((resolve) => {
    out(`dsh: attached to web server on port ${port} (Ctrl-C detaches, server keeps running)\n`);
    const stopFollow = followLog(logFile, lines, out);
    let polling = false;

    /** Poll the inventory RPC once and print the metrics banner. */
    async function poll(): Promise<void> {
      if (polling) return; // a slow RPC must not stack up polls
      polling = true;
      try {
        const entries = await fetchPluginInventory(port, home, profile);
        const metrics = entries === null ? null : summarizePluginMetrics(entries);
        out(`${formatPluginMetricsLine(metrics, new Date())}\n`);
      } finally {
        polling = false;
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), intervalMs);

    /** Detach: tear down the watcher and timer, then resolve. */
    function detach(): void {
      clearInterval(timer);
      if (stopFollow !== null) stopFollow();
      process.off("SIGINT", detach);
      out("\ndsh: detached (web server still running)\n");
      resolve();
    }

    process.on("SIGINT", detach);
  });
}
