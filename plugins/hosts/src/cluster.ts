/**
 * Multi-node cluster coordinator and worker deployment generator.
 */

import type { NetworkNode } from "./types.js";

export class ClusterManager {
  /**
   * Generate an automated one-line startup command for pairing a remote node
   * to this coordinator over Tailscale.
   */
  generateWorkerCommand(targetNode: NetworkNode, coordinatorUrl: string): string {
    const isWin = targetNode.os === "windows";
    if (isWin) {
      return `powershell -Command "irm ${coordinatorUrl}/hosts/bootstrap.ps1 | iex"`;
    }
    return `curl -fsSL ${coordinatorUrl}/hosts/bootstrap.sh | sh`;
  }

  /**
   * Validate node reachability via HTTP ping.
   */
  async pingNode(node: NetworkNode): Promise<boolean> {
    if (!node.ips || node.ips.length === 0) return false;
    const targetIp = node.ips[0];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://${targetIp}:3080/hosts/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }
}
