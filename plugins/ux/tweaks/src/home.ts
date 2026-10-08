/**
 * tweaks home resolution shared by the CLI verbs: honors `DSH_HOME`,
 * then the `tweaks.homeRoot` section of the default home's settings.yaml,
 * then `~/.agents`. Mirrors the launcher's resolution order so the verbs
 * read the same home the harness boots.
 * @module tweaks/home
 */

import { resolve } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

/** Default home when nothing else says otherwise. */
export function defaultHome(): string {
  return resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
}

/** Read the `homeRoot` line from a settings.yaml's `tweaks:` section. */
export async function tweaksHomeRoot(home: string): Promise<string | undefined> {
  try {
    const text = await readFile(join(home, "settings.yaml"), "utf8");
    const section = text.match(/^tweaks:\n([\s\S]*?)(?=^\S|\n\S|$)/m)?.[1];
    const value = section?.match(/^\s+homeRoot:\s*(\S+)\s*$/m)?.[1];
    if (value === undefined || value.trim().length === 0) return undefined;
    return resolve(value.replace(/^~/, homedir()));
  } catch {
    return undefined;
  }
}

/** Effective agent home for a verb: DSH_HOME → settings homeRoot → default. */
export async function resolveHome(): Promise<string> {
  const base = defaultHome();
  const tweaks = await tweaksHomeRoot(base);
  return tweaks ?? base;
}
