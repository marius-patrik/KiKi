import type { PluginInventoryEntry } from "./plugin-inventory.js";

/**
 * Counts derived from a plugin inventory snapshot, broken out by fiber phase
 * rather than folded into an active/total ratio. `notMounted` (a `null`
 * phase) is a normal, harmless state for harness tool/skill entries the
 * loader has not instantiated yet; `pending` is a fiber genuinely stuck
 * waiting on an injected service, which the harness docs call out as a real
 * silent failure and which looked identical to `notMounted` before this
 * split (#116).
 */
export interface PluginMetrics {
  total: number;
  active: number;
  pending: PluginInventoryEntry[];
  notMounted: number;
  failed: PluginInventoryEntry[];
}

/**
 * Summarize a plugin inventory snapshot into the counts both `dsh status` and
 * the `dsh attach` metrics line report.
 */
export function summarizePluginMetrics(entries: PluginInventoryEntry[]): PluginMetrics {
  return {
    total: entries.length,
    active: entries.filter((entry) => entry.fiberPhase === "active").length,
    pending: entries.filter((entry) => entry.fiberPhase === "pending"),
    notMounted: entries.filter((entry) => entry.fiberPhase === null).length,
    failed: entries.filter((entry) => entry.fiberPhase === "failed"),
  };
}

/**
 * Render the one-line live metrics banner `dsh attach` prints on every poll.
 * A null snapshot means the server did not answer the inventory RPC, which is
 * reported rather than hidden — an unreachable server is the interesting case
 * while attached.
 */
export function formatPluginMetricsLine(metrics: PluginMetrics | null, at: Date): string {
  const clock = at.toTimeString().slice(0, 8);
  if (metrics === null) return `── ${clock} · plugins: server not answering ──`;
  return (
    `── ${clock} · plugins: ${metrics.active} active · ${metrics.pending.length} pending · ` +
    `${metrics.notMounted} not mounted · ${metrics.failed.length} failed ──`
  );
}
