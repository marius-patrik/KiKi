/**
 * Bi-Directional State Synchronizer for hosts cluster.
 * Synchronizes sessions, vaults, and presets across multiple nodes.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

export interface FileManifestEntry {
  path: string;
  size: number;
  mtime: number;
  hash: string;
}

export interface ClusterSyncManifest {
  timestamp: number;
  nodeId: string;
  files: Record<string, FileManifestEntry>;
}

export class ClusterSyncEngine {
  private homeDir: string;

  /** Constructs an instance. */
  constructor(homeDir?: string) {
    this.homeDir = homeDir || process.env.DSH_HOME || join(homedir(), ".agents");
  }

  /**
   * Build an incremental file manifest with SHA-256 hashes.
   */
  async buildManifest(nodeId: string): Promise<ClusterSyncManifest> {
    const files: Record<string, FileManifestEntry> = {};
    const targets = ["sessions", "vault", "agent-presets"];

    for (const target of targets) {
      const dirPath = join(this.homeDir, target);
      await this.scanDirRecursive(dirPath, target, files);
    }

    return {
      timestamp: Date.now(),
      nodeId,
      files,
    };
  }

  /** scanDirRecursive implementation. */
  private async scanDirRecursive(
    currentDir: string,
    relativePrefix: string,
    result: Record<string, FileManifestEntry>,
  ): Promise<void> {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        const relPath = join(relativePrefix, entry.name);
        if (entry.isDirectory()) {
          await this.scanDirRecursive(fullPath, relPath, result);
        } else if (entry.isFile()) {
          const s = await stat(fullPath);
          const content = await readFile(fullPath);
          const hash = createHash("sha256").update(content).digest("hex");
          result[relPath] = {
            path: relPath,
            size: s.size,
            mtime: s.mtimeMs,
            hash,
          };
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  /**
   * Compare two manifests and derive files to push/pull.
   */
  diffManifests(
    local: ClusterSyncManifest,
    remote: ClusterSyncManifest,
  ): {
    needsPull: string[];
    needsPush: string[];
  } {
    const needsPull: string[] = [];
    const needsPush: string[] = [];

    for (const [path, remoteEntry] of Object.entries(remote.files)) {
      const localEntry = local.files[path];
      if (!localEntry || localEntry.hash !== remoteEntry.hash) {
        if (!localEntry || remoteEntry.mtime > localEntry.mtime) {
          needsPull.push(path);
        }
      }
    }

    for (const [path, localEntry] of Object.entries(local.files)) {
      const remoteEntry = remote.files[path];
      if (!remoteEntry || remoteEntry.hash !== localEntry.hash) {
        if (!remoteEntry || localEntry.mtime > remoteEntry.mtime) {
          needsPush.push(path);
        }
      }
    }

    return { needsPull, needsPush };
  }
}
