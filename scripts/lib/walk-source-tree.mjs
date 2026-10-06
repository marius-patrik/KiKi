/**
 * Recursively yields files under a directory, skipping build output and
 * dependencies (`node_modules`, `lib`, `.git`).
 *
 * Three verification/dispatch scripts independently reimplemented this same
 * walk, which jscpd's zero-threshold duplicate gate correctly flagged as
 * unextracted duplication rather than structural repetition.
 *
 * @module @dsh-stack/scripts/lib/walk-source-tree
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";

/**
 * @param dir - directory to walk.
 * @param options.extensions - when set, only yields files whose name ends in
 *   one of these extensions (e.g. `["ts", "tsx", "mjs", "js"]`); omitted,
 *   yields every file.
 */
export async function* walkSourceTree(dir, options = {}) {
  const { extensions } = options;
  const pattern = extensions ? new RegExp(`\\.(${extensions.join("|")})$`) : null;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "lib" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkSourceTree(full, options);
    else if (!pattern || pattern.test(entry.name)) yield full;
  }
}
