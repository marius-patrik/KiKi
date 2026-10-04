import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { findListenerPid } from "./processes.js";
import { fetchPluginInventory } from "./plugin-inventory.js";
import { summarizePluginMetrics } from "./plugin-metrics.js";
import { parseLaunchToken } from "./ports.js";

/** Tailscale addresses for the status URL, when the tailscale CLI exists. */
interface TailscaleInfo {
  ip: string;
  dns: string;
}

/** Best-effort Tailscale lookup; empty strings when tailscale is absent. */
function tailscaleInfo(): TailscaleInfo {
  const probe = spawnSync("tailscale", ["ip", "-4"], { encoding: "utf8" });
  if (probe.error !== undefined || probe.status !== 0) return { ip: "", dns: "" };
  const ip = (probe.stdout ?? "").trim();
  const status = spawnSync("tailscale", ["status", "--json"], { encoding: "utf8" });
  let dns = "";
  try {
    const parsed: unknown = JSON.parse(status.stdout ?? "");
    if (typeof parsed === "object" && parsed !== null && "Self" in parsed) {
      const self = (parsed as { Self?: { DNSName?: unknown } }).Self;
      if (typeof self?.DNSName === "string") dns = self.DNSName.replace(/\.$/, "");
    }
  } catch {
    /* unparsable status: no DNS name */
  }
  return { ip, dns };
}

/**
 * Query the running server's plugin inventory and render it as status lines:
 * a summary line plus one line per failed plugin (up to five). Returns an
 * empty list when the server doesn't answer.
 */
async function pluginHealth(port: number, home: string, profile: string): Promise<string[]> {
  const entries = await fetchPluginInventory(port, home, profile);
  if (entries === null) return [];
  const metrics = summarizePluginMetrics(entries);
  const lines = [
    `  Plugins:       ${metrics.active} active · ${metrics.pending.length} pending · ` +
      `${metrics.notMounted} not mounted · ${metrics.failed.length} failed`,
  ];
  for (const failed of metrics.failed.slice(0, 5)) {
    lines.push(`    ✗ Failed: ${failed.entryId} (${failed.moduleName})`);
  }
  return lines;
}

/**
 * Build the `dsh status` report for the server expected on `port`: running
 * state with PID and preferred URL (Tailscale DNS, then Tailscale IP, then
 * loopback), the log file location, and plugin health when reachable.
 * `home` and `profile` are needed to authenticate the plugin-inventory RPC
 * (see plugin-inventory.ts).
 */
export async function statusReport(
  port: number,
  logFile: string,
  home: string,
  profile: string,
): Promise<string> {
  const pid = findListenerPid(port);
  if (pid === null) {
    return `○ dsh web server is not running (port ${port} is free)`;
  }
  const ts = tailscaleInfo();
  let url = `http://127.0.0.1:${port}`;
  if (ts.dns.length > 0) url = `http://${ts.dns}:${port}`;
  else if (ts.ip.length > 0) url = `http://${ts.ip}:${port}`;
  // Since #218's harness bump, every address needs the boot-printed token
  // (or an existing signed cookie for that exact origin, which this CLI
  // invocation cannot see) before the browser gets past its 401 page --
  // append it so the printed address actually opens, not just names a host.
  let logText = "";
  try {
    logText = readFileSync(logFile, "utf8");
  } catch {
    /* no log yet */
  }
  const token = parseLaunchToken(logText);
  if (token !== null) url = `${url}/?token=${token}`;
  const lines = [
    `● dsh web server is running (PID: ${pid})`,
    `  Address: ${url}`,
    `  Logs:    ${logFile}`,
  ];
  lines.push(...(await pluginHealth(port, home, profile)));
  return lines.join("\n");
}
