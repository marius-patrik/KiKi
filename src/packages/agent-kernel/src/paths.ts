/**
 * Persistent agent-state path resolution.
 * @module agent-kernel/paths
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the effective DSH home without importing launcher/runtime ownership. */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME;
  return configured !== undefined && configured.length > 0
    ? configured
    : join(homedir(), ".agents");
}

/** Resolve the root directory owned by the persistent agent substrate. */
export function resolveAgentStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), "agent");
}
