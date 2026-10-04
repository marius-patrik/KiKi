/**
 * Theme store: installed theme files under the agent home (`<root>/<id>.json`).
 * A stored file carries the registry definition plus display metadata, so the
 * web route and CLI verbs read one format and the browser registers straight
 * from it. Reads are tolerant of one corrupt file (skipped with a warning) so
 * a hand-edited store cannot break every other theme.
 * @module themes/store
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { ThemeDefinition } from "./theme.js";

/** The displayable theme record as stored on disk. */
export interface StoredTheme extends ThemeDefinition {
  /** Source theme name (for display; the registry id is derived from it). */
  name: string;
  /**
   * Catalog provenance (`namespace.name`) when installed from an Open VSX
   * extension; the catalog pane marks that extension installed from it.
   */
  extension?: string;
}

/** Themes dir resolution result. */
export interface StoreHandle {
  /** Absolute theme directory (created on first write). */
  dir: string;
  /** Absolute path of one theme file. */
  file(id: string): string;
}

/**
 * Resolve the store directory: absolute roots pass through, relative roots are
 * joined under the agent home.
 * @param home - the agent home directory.
 * @param root - configured root (relative or absolute).
 */
export function resolveStoreDir(home: string, root: string): string {
  return isAbsolute(root) ? root : join(home, root);
}

/**
 * Build the store handle for a resolved directory.
 * @param home - the agent home directory.
 * @param root - configured root (relative or absolute).
 */
export function storeHandle(home: string, root: string): StoreHandle {
  const dir = resolveStoreDir(home, root);
  return { dir, file: (id) => join(dir, `${id}.json`) };
}

/**
 * List installed themes, newest first; corrupt files are skipped.
 * @param handle - the store handle.
 * @param warn - optional reporter for skipped files.
 */
export async function listThemes(
  handle: StoreHandle,
  warn?: (message: string) => void,
): Promise<StoredTheme[]> {
  let names: string[];
  try {
    names = await readdir(handle.dir);
  } catch {
    return [];
  }
  const themes: StoredTheme[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      themes.push(await readTheme(handle, name));
    } catch (error) {
      warn?.(`themes: skipping unreadable theme file ${name}: ${String(error)}`);
    }
  }
  themes.sort((a, b) => a.name.localeCompare(b.name));
  return themes;
}

/**
 * Read one theme by file name.
 * @param handle - the store handle.
 * @param fileName - the `*.json` file name.
 * @throws on unreadable or malformed files.
 */
export async function readTheme(handle: StoreHandle, fileName: string): Promise<StoredTheme> {
  const text = await readFile(join(handle.dir, fileName), "utf8");
  const value = JSON.parse(text) as Partial<StoredTheme>;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    (value.colorScheme !== "light" && value.colorScheme !== "dark") ||
    typeof value.tokens !== "object" ||
    value.tokens === null
  ) {
    throw new Error(`malformed theme file ${fileName}`);
  }
  return value as StoredTheme;
}

/**
 * Persist a theme; the file name follows the registry id.
 * @param handle - the store handle.
 * @param theme - the theme to store.
 */
export async function saveTheme(handle: StoreHandle, theme: StoredTheme): Promise<void> {
  await mkdir(handle.dir, { recursive: true });
  await writeFile(handle.file(theme.id), `${JSON.stringify(theme, null, 2)}\n`, "utf8");
}

/**
 * Remove one theme by id.
 * @param handle - the store handle.
 * @param id - the theme id.
 * @returns whether a file was removed.
 */
export async function removeTheme(handle: StoreHandle, id: string): Promise<boolean> {
  try {
    await rm(handle.file(id));
    return true;
  } catch {
    return false;
  }
}
