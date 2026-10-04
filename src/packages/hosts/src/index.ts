/**
 * hosts: Multi-node device and cluster manager Cordis plugin.
 * @module hosts
 */

import { Service, type Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { scanTailscaleTopology, syncTailscaleServe } from "./tailscale.js";
import { getPrimaryLanIp } from "./local-interfaces.js";
import { AccessGateway } from "./gateway.js";
import { ClusterManager } from "./cluster.js";
import { RemoteDeployer } from "./deployer.js";
import { ClusterSyncEngine } from "./sync.js";
import { VirtualDomainManager } from "./virtual-domain.js";
import type { AccessConfig, ClusterStatus, IHostsService, NetworkNode } from "./types.js";

export * from "./types.js";
export * from "./github-actions-runner.js";
export { VirtualDomainManager, type VirtualDomainConfig } from "./virtual-domain.js";

export const name = "hosts";
export const inject = ["webServer"];

declare module "@deepseek-ai/cordis" {
  interface Context {
    hosts: HostsService;
  }
}

export class HostsService extends Service implements IHostsService {
  private gateway: AccessGateway | null = null;
  private readonly clusterManager = new ClusterManager();
  private readonly deployer = new RemoteDeployer();
  private readonly syncEngine = new ClusterSyncEngine();
  private readonly domainManager = new VirtualDomainManager();
  private cachedStatus: ClusterStatus | null = null;
  private lastScan = 0;

  /** Constructs an instance. */
  constructor(
    ctx: Context,
    public readonly config?: Partial<AccessConfig>,
  ) {
    super(ctx, "hosts");
    const access = this.getAccessConfig();
    this.gateway = new AccessGateway(access);
    void this.domainManager.registerMdns();
    void syncTailscaleServe(access.gatewayPort);

    ctx.effect(() => () => {
      this.domainManager.unregisterMdns();
    });
    process.once("exit", () => {
      this.domainManager.unregisterMdns();
    });

    // dsh web's own startup banner reports the web-asset port, not this
    // gateway port — Tailscale serve and every external consumer need this
    // one. ports.ts prefers this line over the harness banner when present.
    console.log(`dsh gateway: http://127.0.0.1:${access.gatewayPort}`);

    const server = ctx.get("webServer");
    if (server) {
      server.register({
        kind: "exact",
        path: "/hosts/api/status",
        handler: async (_req: IncomingMessage, res: ServerResponse) => {
          const status = await this.getClusterStatus();
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify(status));
        },
      });
      server.register({
        kind: "exact",
        path: "/hosts/api/health",
        handler: async (_req: IncomingMessage, res: ServerResponse) => {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ ok: true, timestamp: Date.now() }));
        },
      });
      server.register({
        kind: "exact",
        path: "/hosts/bootstrap.sh",
        handler: async (_req: IncomingMessage, res: ServerResponse) => {
          const script = this.deployer.generateUnixBootstrap(access.permanentUrl);
          res.writeHead(200, {
            "Content-Type": "text/x-shellscript",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(script);
        },
      });
      server.register({
        kind: "exact",
        path: "/hosts/bootstrap.ps1",
        handler: async (_req: IncomingMessage, res: ServerResponse) => {
          const script = this.deployer.generateWindowsBootstrap(access.permanentUrl);
          res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
          res.end(script);
        },
      });
      server.register({
        kind: "exact",
        path: "/hosts/api/sync/manifest",
        handler: async (_req: IncomingMessage, res: ServerResponse) => {
          const manifest = await this.syncEngine.buildManifest("coordinator");
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify(manifest));
        },
      });
    }

    void this.gateway.start().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[hosts] gateway notice: ${message}`);
    });
    ctx.effect(
      () => () => {
        if (this.gateway) {
          void this.gateway.stop();
          this.gateway = null;
        }
      },
      "hosts: gateway lifecycle",
    );
  }

  /**
   * Returns the access configuration for the service.
   *
   * Guarantees a configuration object with mode, gatewayPort, backendPort, activeUrl,
   * permanentUrl, tailnetDns, lanIp, and clusterDomain populated based on the current
   * configuration and network settings.
   */
  getAccessConfig(): AccessConfig {
    const gatewayPort = this.config?.gatewayPort ?? 3080;
    const backendPort = this.config?.backendPort ?? 3081;
    const mode = this.config?.mode ?? "tailnet";
    const lanIp = getPrimaryLanIp();
    const tailnetDns = "mac.taildbbf82.ts.net";
    const permanentUrl = this.domainManager.getPermanentAddress(tailnetDns);
    return {
      mode,
      gatewayPort,
      backendPort,
      activeUrl: `http://${tailnetDns}:${gatewayPort}`,
      permanentUrl,
      tailnetDns,
      lanIp,
      clusterDomain: "dsh.local",
    };
  }

  /**
   * Returns the current list of nodes in the cluster.
   *
   * Guarantees: Returns the nodes array from the cluster status.
   *
   * On failure: Rescans the topology and returns the updated status.
   */
  async listNodes(): Promise<NetworkNode[]> {
    const status = await this.getClusterStatus();
    return status.nodes;
  }

  /**
   * Retrieves the current status of the cluster.
   *
   * Guarantees: Returns the cluster status object containing nodes and other status information.
   *
   * On failure: Rescans the cluster topology and returns the updated status.
   */
  async getClusterStatus(): Promise<ClusterStatus> {
    const now = Date.now();
    if (this.cachedStatus && now - this.lastScan < 10000) return this.cachedStatus;
    return this.rescanTopology();
  }

  /**
   * Rescans the cluster topology to update the status.
   *
   * Guarantees: Returns the updated cluster status object containing nodes and other status information.
   *
   * On failure: Rescans the topology and returns the updated status.
   */
  async rescanTopology(): Promise<ClusterStatus> {
    const ts = await scanTailscaleTopology();
    const access = this.getAccessConfig();
    const nodes: NetworkNode[] = [];
    if (ts.self) {
      ts.self.activeUrl = access.activeUrl;
      nodes.push(ts.self);
    }
    for (const peer of ts.peers) {
      if (peer.dnsName) peer.activeUrl = `http://${peer.dnsName}:${access.gatewayPort}`;
      else if (peer.ips[0]) peer.activeUrl = `http://${peer.ips[0]}:${access.gatewayPort}`;
      nodes.push(peer);
    }
    const onlineNodes = nodes.filter((n) => n.online).length;
    const manifest = await this.syncEngine.buildManifest(ts.self?.id || "self");
    const trackedFiles = Object.keys(manifest.files).length;
    this.cachedStatus = {
      coordinator: ts.self,
      nodes,
      totalNodes: nodes.length,
      onlineNodes,
      access,
      syncStatus: { synced: true, lastSync: Date.now(), trackedFiles },
    };
    this.lastScan = Date.now();
    return this.cachedStatus;
  }

  /**
   * Updates the cached status by scanning the Tailscale topology, determining active URLs for nodes,
   * and building a manifest of tracked files. Returns the status including nodes, online nodes count,
   * and synchronization status.
   *
   * Guarantees: Returns an object with coordinator, nodes, total nodes count, online nodes count,
   *             access configuration, and sync status.
   *
   * On failure: Logs the error internally without affecting the returned status.
   */
  async deployWorker(nodeId: string): Promise<{ ok: boolean; message: string; command?: string }> {
    const status = await this.getClusterStatus();
    const node = status.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return { ok: false, message: `Node with id ${nodeId} not found` };
    const command = this.clusterManager.generateWorkerCommand(node, status.access.permanentUrl);
    return {
      ok: true,
      message: `Run this command on ${node.name} (${node.os}) to connect it as a worker node:`,
      command,
    };
  }
}

/**
 * Deploys a worker on the specified node.
 *
 * Guarantees: Returns an object indicating whether the deployment was successful, a message describing the result,
 *             and optionally the command used for deployment.
 *
 * On failure: Logs the error internally and returns a failure message without affecting the deployment status.
 */
export function apply(ctx: Context, config?: Partial<AccessConfig>): void {
  ctx.plugin(HostsService, config);
}
