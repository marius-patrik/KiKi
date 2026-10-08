/**
 * Permanent Virtual Cluster Domain and Ingress Manager.
 * Allows dsh to have a fixed cluster address (e.g. dsh.local or custom domain).
 */

import { execFile, type ChildProcess } from "node:child_process";

export interface VirtualDomainConfig {
  clusterDomain: string;
  enableMdns: boolean;
  permanentPort: number;
}

export class VirtualDomainManager {
  private config: VirtualDomainConfig;
  private mdnsProcess: ChildProcess | null = null;

  /** Constructs an instance. */
  constructor(config?: Partial<VirtualDomainConfig>) {
    this.config = {
      clusterDomain: config?.clusterDomain || "dsh.local",
      enableMdns: config?.enableMdns ?? true,
      permanentPort: config?.permanentPort || 3080,
    };
  }

  /**
   * Get the primary permanent address for accessing the dsh cluster.
   */
  getPermanentAddress(tailnetDns?: string): string {
    if (this.config.clusterDomain && this.config.clusterDomain !== "dsh.local") {
      return `http://${this.config.clusterDomain}:${this.config.permanentPort}`;
    }
    if (tailnetDns) {
      return `http://${tailnetDns}:${this.config.permanentPort}`;
    }
    return `http://${this.config.clusterDomain}:${this.config.permanentPort}`;
  }

  /**
   * Register permanent local mDNS name (dsh.local) via dns-sd on macOS / avahi on Linux.
   */
  async registerMdns(): Promise<boolean> {
    if (!this.config.enableMdns) return false;
    this.unregisterMdns();
    try {
      if (process.platform === "darwin") {
        // macOS dns-sd background advertisement
        const proc = execFile(
          "dns-sd",
          ["-R", "dsh", "_http._tcp", "local", String(this.config.permanentPort)],
          (err) => {
            if (err && !proc.killed) console.warn("[hosts] mDNS notice:", err.message);
          },
        );
        proc.on("exit", () => {
          if (this.mdnsProcess === proc) {
            this.mdnsProcess = null;
          }
        });
        this.mdnsProcess = proc;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Unregister local mDNS advertisement by terminating the running dns-sd process.
   */
  unregisterMdns(): void {
    if (this.mdnsProcess) {
      if (!this.mdnsProcess.killed) {
        this.mdnsProcess.kill();
      }
      this.mdnsProcess = null;
    }
  }
}
