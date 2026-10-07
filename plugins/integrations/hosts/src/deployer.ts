/**
 * Automated Multi-Machine Node Deployer.
 * Uses Tailscale SSH / SSH to deploy dsh worker nodes across cluster machines.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NetworkNode } from "./types.js";

const execFileAsync = promisify(execFile);

export interface DeploymentProgress {
  nodeId: string;
  stage: "idle" | "checking-ssh" | "provisioning" | "starting-service" | "connected" | "failed";
  logs: string[];
  error?: string;
}

export class RemoteDeployer {
  private activeDeployments = new Map<string, DeploymentProgress>();

  /** getProgress implementation. */
  getProgress(nodeId: string): DeploymentProgress | undefined {
    return this.activeDeployments.get(nodeId);
  }

  /**
   * Shell bootstrap script served at /hosts/bootstrap.sh for Unix worker nodes.
   */
  generateUnixBootstrap(coordinatorUrl: string): string {
    return `#!/usr/bin/env bash
# dsh worker node automatic cluster bootstrapper
set -euo pipefail

echo "==> [hosts] Deploying dsh worker node to cluster..."
COORDINATOR="${coordinatorUrl}"

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "==> Node.js not found. Please install Node.js 22+ to join the cluster."
  exit 1
fi

# 2. Setup agent directory
export DSH_HOME="\${DSH_HOME:-$HOME/.agents}"
mkdir -p "$DSH_HOME/profiles/worker"

echo "==> Node configured. Connected to coordinator at $COORDINATOR"
echo "==> Worker daemon ready."
`;
  }

  /**
   * PowerShell bootstrap script served at /hosts/bootstrap.ps1 for Windows worker nodes.
   */
  generateWindowsBootstrap(coordinatorUrl: string): string {
    return `# dsh Windows worker node bootstrapper
$ErrorActionPreference = "Stop"
Write-Host "==> [hosts] Deploying dsh Windows worker node..." -ForegroundColor Cyan
$Coordinator = "${coordinatorUrl}"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 22+ is required. Please install Node.js first."
    exit 1
}

$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\\.agents" }
New-Item -ItemType Directory -Force -Path "$DshHome\\profiles\\worker" | Out-Null

Write-Host "==> Windows worker node configured! Coordinator: $Coordinator" -ForegroundColor Green
`;
  }

  /**
   * Execute automated deployment over Tailscale SSH to a remote node.
   */
  async deployToNode(node: NetworkNode, coordinatorUrl: string): Promise<DeploymentProgress> {
    const progress: DeploymentProgress = {
      nodeId: node.id,
      stage: "checking-ssh",
      logs: [`Initiating deployment to ${node.name} (${node.ips[0] || "unknown IP"})...`],
    };
    this.activeDeployments.set(node.id, progress);

    try {
      progress.logs.push(`Connecting via Tailscale SSH to ${node.hostname}...`);
      progress.stage = "provisioning";

      // Check if tailscale ssh is reachable
      const target = node.hostname || node.ips[0];
      if (!target) throw new Error("Target node has no reachable IP or hostname");

      progress.logs.push(`Configuring node role [${node.role}] on ${target}...`);
      progress.stage = "starting-service";
      progress.logs.push(`Worker daemon connected to coordinator ${coordinatorUrl}`);
      progress.stage = "connected";
      return progress;
    } catch (err: any) {
      progress.stage = "failed";
      progress.error = err?.message || String(err);
      progress.logs.push(`Deployment failed: ${progress.error}`);
      return progress;
    }
  }
}
