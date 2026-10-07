import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** State directories migrated to a new homeRoot. */
const MIGRATED_DIRS = ["profiles", "sessions", "vault"] as const;

/** State files migrated to a new homeRoot. */
const MIGRATED_FILES = [
  "settings.yaml",
  ".credentials.yaml",
  "accounts.vault",
  "accounts.key",
] as const;

/** Resolve the harness home: DSH_HOME when set, else ~/.agents. */
export function resolveHome(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.DSH_HOME;
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : join(homedir(), ".agents");
}

/**
 * Non-destructively migrate harness state from `home` to `homeRoot`: every
 * listed directory/file is copied only when it exists at the source and does
 * not yet exist at the destination. Returns the effective home — `homeRoot`
 * when a move applies, otherwise the unchanged `home`.
 */
export function migrateHome(home: string, homeRoot: string, log: (msg: string) => void): string {
  if (homeRoot.length === 0 || homeRoot === home) return home;
  log(`dsh: tweaks.homeRoot moved state ${home} -> ${homeRoot}`);
  mkdirSync(homeRoot, { recursive: true });
  for (const dir of MIGRATED_DIRS) {
    const from = join(home, dir);
    const to = join(homeRoot, dir);
    if (existsSync(from) && statSync(from).isDirectory() && !existsSync(to)) {
      cpSync(from, to, { recursive: true });
    }
  }
  for (const file of MIGRATED_FILES) {
    const from = join(home, file);
    const to = join(homeRoot, file);
    if (existsSync(from) && statSync(from).isFile() && !existsSync(to)) {
      cpSync(from, to);
    }
  }
  return homeRoot;
}
