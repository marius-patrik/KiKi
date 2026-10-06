/**
 * Settings-document mirroring for the `dsh-tweaks` namespace. The launcher
 * only ever reads `$HOME/settings.yaml`, so this plugin makes sure the tweaks
 * section lives in every agent home's settings.yaml — the home it boots under
 * and the default `~/.agents` home — keeping rediscovery stable no matter
 * which home the launcher happens to be launched from.
 * @module tweaks/mirror
 */

import { Document, parseDocument } from "yaml";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { TWEAKS_SETTINGS_KEY as SETTINGS_KEY } from "./settings.js";

/** The normalized, always-map `dsh-tweaks` section written to disk. */
export interface TweaksSection {
  homeRoot?: string;
  command?: string;
}

/** Reduce a config to the stored section shape (empty or blank fields dropped). */
export function normalizeSection(value: TweaksSection): Record<string, string> {
  const homeRoot = value.homeRoot?.trim() ?? "";
  const command = value.command?.trim() ?? "";
  return {
    ...(homeRoot.length === 0 ? {} : { homeRoot }),
    ...(command.length === 0 ? {} : { command }),
  };
}

/** Deep equality of two section values (undefined === absent). */
export function sectionsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Read the `dsh-tweaks` top-level section of a settings document. */
export async function readTweaksSection(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch {
    return undefined;
  }
  if (text.trim().length === 0) return undefined;
  const root = parseDocument(text).toJS() as Record<string, unknown> | null;
  if (typeof root === "object" && root !== null) return root[SETTINGS_KEY];
  return undefined;
}

/**
 * Merge the `dsh-tweaks` section into a settings document, preserving every
 * other section and as much formatting as the yaml round-trip keeps. Creates
 * the document when it does not exist. Returns whether the document changed.
 */
export async function writeTweaksSection(
  path: string,
  section: Record<string, string>,
): Promise<boolean> {
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch {
    text = "";
  }
  const doc = text.trim().length === 0 ? new Document({}) : parseDocument(text);
  const current = sectionsEqual(doc.toJS()?.[SETTINGS_KEY], section);
  if (current) return false;
  doc.set(SETTINGS_KEY, doc.createNode(section));
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, doc.toString(), { mode: 0o600 });
  return true;
}
