export type { AttachOptions } from "./attach.js";
export { attachToServer } from "./attach.js";
export { browserSessionCookieHeader, readBrowserSessionSecret } from "./browser-session-cookie.js";
export { loadCredentialEnv } from "./credentials-env.js";
export type { HeadlessProfileOptions } from "./headless-profile.js";
export { ensureHeadlessProfile, normalizeCustomProviders } from "./headless-profile.js";
export { migrateHome, resolveHome } from "./home.js";
export { followLog, readLogTail } from "./logs.js";
export { findHarnessDir, harnessCli, packageDir, tsxAvailable, verbBin } from "./paths.js";
export type { PluginInventoryEntry } from "./plugin-inventory.js";
export { fetchPluginInventory, parsePluginInventory } from "./plugin-inventory.js";
export type { PluginMetrics } from "./plugin-metrics.js";
export { formatPluginMetricsLine, summarizePluginMetrics } from "./plugin-metrics.js";
export {
  DEFAULT_PORT,
  parseBoundPort,
  parseGatewayPort,
  parseLaunchToken,
  readProfilePort,
  resolvePort,
  startPortHint,
} from "./ports.js";
export type { StartedServer } from "./processes.js";
export { findListenerPid, startServer, stopServer } from "./processes.js";
export { ensureProfileComposition } from "./profile-composition.js";
export type { ProfileCompositionOptions } from "./profile-composition.js";
export type { PruneWorktreesOptions } from "./prune-worktrees.js";
export { originRepo, pruneMergedWorktrees } from "./prune-worktrees.js";
export type { RouteOptions, RoutePlan } from "./route.js";
export { parseAttachArgs, parseLogsArgs, route } from "./route.js";
export { statusReport } from "./status.js";
export type { DshTweaks } from "./tweaks.js";
export { readTweaks } from "./tweaks.js";
export type { PruneDecision, PruneDecisionInput, WorktreeEntry } from "./worktree-prune.js";
export { decidePrune, parseWorktreeList } from "./worktree-prune.js";
