/**
 * Types for the hosts multi-node cluster and network device manager.
 */

export type NodeRole = "coordinator" | "worker" | "peer" | "client";

export interface NetworkNode {
  id: string;
  name: string;
  hostname: string;
  dnsName?: string;
  ips: string[];
  os: "macos" | "windows" | "linux" | "ios" | "android" | "other";
  online: boolean;
  isSelf: boolean;
  role: NodeRole;
  capabilities: string[];
  activeUrl?: string;
  lastSeen?: string;
}

export type AccessMode = "tailnet" | "lan" | "loopback" | "all";

export interface AccessConfig {
  mode: AccessMode;
  gatewayPort: number;
  backendPort: number;
  activeUrl: string;
  permanentUrl: string;
  tailnetDns?: string;
  tailscaleIp?: string;
  lanIp?: string;
  clusterDomain?: string;
}

export interface ClusterStatus {
  coordinator: NetworkNode | null;
  nodes: NetworkNode[];
  totalNodes: number;
  onlineNodes: number;
  access: AccessConfig;
  syncStatus: {
    synced: boolean;
    lastSync: number;
    trackedFiles: number;
  };
}

export interface IHostsService {
  listNodes(): Promise<NetworkNode[]>;
  getClusterStatus(): Promise<ClusterStatus>;
  getAccessConfig(): AccessConfig;
  rescanTopology(): Promise<ClusterStatus>;
  deployWorker(nodeId: string): Promise<{ ok: boolean; message: string; command?: string }>;
}
