/**
 * Open VSX catalog access: search the marketplace and install a theme
 * extension by downloading its vsix (a zip) and reading the theme JSON under
 * `extension/themes/`. The system `unzip` extracts the vsix into a temp dir —
 * every target platform ships one, so no zip library is needed. Network work
 * is a small pure-function seam so tests inject a local catalog server.
 * @module themes/catalog
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseTmThemeXml, parseVsCodeTheme, type ThemeSource } from "./theme.js";

const execFileAsync = promisify(execFile);

/** One Open VSX extension hit (search result). */
export interface CatalogExtension {
  /** Extension namespace (publisher). */
  namespace: string;
  /** Extension name. */
  name: string;
  /** Human-readable name. */
  displayName: string;
  /** One-line description. */
  description: string;
  /** Latest version. */
  version: string;
  /** Publisher's download count. */
  downloadCount: number;
  /** Direct vsix download URL. */
  download: string;
}

/** Search a catalog for theme extensions.
 * @param baseUrl - the Open VSX root (e.g. `https://open-vsx.org`).
 * @param query - search terms.
 * @param limit - max results.
 * @returns the matching extensions.
 */
export async function searchCatalog(
  baseUrl: string,
  query: string,
  limit = 10,
): Promise<CatalogExtension[]> {
  const url = new URL("/api/-/search", baseUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("category", "Themes");
  url.searchParams.set("size", String(limit));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`themes: catalog search failed (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { extensions?: Array<Record<string, unknown>> };
  return (body.extensions ?? []).map(parseExtension);
}

/**
 * Resolve one extension's latest metadata by identity: the install verb's
 * lookup step, so the browser sends only namespace/name and the node half owns
 * the download URL (no client-supplied fetch targets).
 * @param baseUrl - the Open VSX root (e.g. `https://open-vsx.org`).
 * @param namespace - extension namespace (publisher).
 * @param name - extension name.
 * @returns the extension metadata, including the vsix download URL.
 */
export async function resolveCatalogExtension(
  baseUrl: string,
  namespace: string,
  name: string,
): Promise<CatalogExtension> {
  const url = new URL(`/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, baseUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `themes: catalog resolve failed for ${namespace}.${name} (HTTP ${response.status})`,
    );
  }
  const body = (await response.json()) as Record<string, unknown>;
  return parseExtension(body);
}

/**
 * Download a vsix to a temp file and return its path; the caller removes the
 * whole temp directory (the file's parent).
 * @param url - the vsix download URL from catalog metadata.
 * @returns the temporary file path.
 */
export async function downloadVsix(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`themes: vsix download failed (HTTP ${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const temp = await mkdtemp(join(tmpdir(), "themes-vsix-"));
  const path = join(temp, "extension.vsix");
  await writeFile(path, buffer);
  return path;
}

/** Narrow one raw extension record. */
function parseExtension(raw: Record<string, unknown>): CatalogExtension {
  const files =
    raw.files === null || typeof raw.files !== "object"
      ? {}
      : (raw.files as Record<string, unknown>);
  return {
    namespace: stringOf(raw.namespace, "namespace"),
    name: stringOf(raw.name, "name"),
    displayName: stringOf(raw.displayName, raw.name as string),
    description: stringOf(raw.description, ""),
    version: stringOf(raw.version, ""),
    downloadCount: numberOr(raw.downloadCount, 0),
    download: stringOf(files.download, ""),
  };
}

/** stringOf implementation. */
function stringOf(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** numberOr implementation. */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/**
 * Extract every theme source from a vsix zip: unzip to a temp dir, then parse
 * each `extension/themes/*.json` (and `.tmTheme`) file.
 * @param vsixPath - path of the downloaded vsix file.
 * @param warn - reporter for skipped/malformed theme files.
 * @returns the extracted theme sources.
 */
export async function extractThemesFromVsix(
  vsixPath: string,
  warn?: (message: string) => void,
): Promise<ThemeSource[]> {
  const temp = await mkdtemp(join(tmpdir(), "themes-"));
  try {
    await execFileAsync("unzip", ["-q", "-o", vsixPath, "-d", temp]);
    const themesDir = join(temp, "extension", "themes");
    let files: string[];
    try {
      files = await readdir(themesDir);
    } catch {
      return [];
    }
    const sources: ThemeSource[] = [];
    for (const file of files) {
      if (!file.endsWith(".json") && !file.endsWith(".tmTheme")) continue;
      try {
        const text = await readFile(join(themesDir, file), "utf8");
        sources.push(
          file.endsWith(".tmTheme")
            ? parseTmThemeXml(text)
            : parseVsCodeTheme(text, file.replace(/\.json$/, "")),
        );
      } catch (error) {
        warn?.(`themes: skipping theme ${file}: ${String(error)}`);
      }
    }
    return sources;
  } finally {
    void rm(temp, { recursive: true, force: true });
  }
}
