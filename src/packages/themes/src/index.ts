/**
 * `themes`: VS Code/TextMate theme support for the dsh web UI. The node
 * half owns the installed theme store (files under the agent home), a
 * `/themes.json` route the browser half registers from, the Open VSX catalog
 * seam (search/download), and the `dsh theme` CLI verbs. The browser half
 * (`client.js`, a hand-authored `__ModuleLoader__` bundle) fetches the route
 * and feeds each installed theme into the harness `ctx.theme` registry, then
 * applies the stored active choice.
 *
 * The registry surface accepts only the semantic `--dsw-alias-*` token layer,
 * so every installed source is mapped to that vocabulary at install time (see
 * `theme.ts`) — the browser never parses VS Code color keys.
 * @module themes
 */

import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { homedir } from "node:os";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { join, resolve } from "node:path";
import { mapTheme, type ThemeSource } from "./theme.js";
import { mountThemeWeb } from "./web.js";
import { listThemes, resolveStoreDir, saveTheme, storeHandle, type StoredTheme } from "./store.js";
import {
  DEFAULT_CATALOG_URL,
  DEFAULT_THEMES_DIR,
  NS,
  ThemesConfig,
  type ThemesConfig as ThemesConfigType,
} from "./settings.js";

export type * from "./theme.js";
export type * from "./store.js";
export type * from "./settings.js";
export {
  ALIAS_TOKENS,
  mapTheme,
  normalizeColor,
  parseTmThemeXml,
  parseVsCodeTheme,
  themeId,
} from "./theme.js";
export { listThemes, removeTheme, resolveStoreDir, saveTheme, storeHandle } from "./store.js";
export {
  searchCatalog,
  extractThemesFromVsix,
  resolveCatalogExtension,
  downloadVsix,
} from "./catalog.js";
export type { CatalogExtension } from "./catalog.js";
export { mountThemeWeb, THEMES_API_PREFIX } from "./web.js";
export type { ThemeWebDeps } from "./web.js";

export const name = "themes";
export const inject: string[] = [];
const DEFAULT_HOME_DIR = join(".agents") as string;

/** resolveHome implementation. */
export function resolveHome(): string {
  return resolve(process.env["DSH_HOME"] ?? join(homedir(), DEFAULT_HOME_DIR));
}

export const Config = ThemesConfig;
export const THEMES_ROUTE = "/themes.json";

export interface InstallThemeOptions {
  id?: string;
  extension?: string;
}

/**
 * Installs a theme source into the theme store.
 *
 * Guarantees that the provided theme source is mapped and stored with the given home and root directory.
 * Returns the stored theme definition if successful, or rejects on failure.
 *
 * @param home - The directory where the theme is stored.
 * @param root - The root directory for the theme installation.
 * @param source - The theme source to install.
 * @param options - Additional options for the installation.
 * @returns The stored theme definition if successful.
 */
export async function installThemeSource(
  home: string,
  root: string,
  source: ThemeSource,
  options: InstallThemeOptions = {},
): Promise<StoredTheme> {
  const handle = storeHandle(home, root);
  const definition = mapTheme(source, options.id);
  const stored: StoredTheme = {
    ...definition,
    name: source.name,
    ...(options.extension === undefined ? {} : { extension: options.extension }),
  };
  await saveTheme(handle, stored);
  return stored;
}

/** installVsix implementation. */
export async function installVsix(
  home: string,
  root: string,
  vsixPath: string,
): Promise<StoredTheme[]> {
  const { extractThemesFromVsix } = await import("./catalog.js");
  const sources = await extractThemesFromVsix(vsixPath);
  const stored: StoredTheme[] = [];
  for (const source of sources) stored.push(await installThemeSource(home, root, source));
  return stored;
}

/**
 * Lists all installed themes.
 *
 * Guarantees that the returned array contains `StoredTheme` objects representing
 * the installed themes in the specified home and root directories.
 *
 * @returns A promise that resolves to an array of `StoredTheme` objects.
 */
export async function listInstalled(home: string, root: string): Promise<StoredTheme[]> {
  return listThemes(storeHandle(home, root));
}

/**
 * Reads the currently active theme id.
 *
 * `ThemesConfig.active` is a live reference the Loader commits every settings
 * write into, so the current value is read from that reference at each call
 * rather than from a captured snapshot.
 *
 * @param config - the projected Config `apply` received.
 * @returns the active theme id, or empty for the built-in preference.
 */
function activeThemeId(config: ThemesConfigType): string {
  return config.active?.get() ?? "";
}

/**
 * apply implementation.
 *
 * Since 0.2.0 no settings form is registered: the settings service projects the
 * volatile Config fields of this plugin's own `themes` entry, so `ThemesConfig`
 * is the form and its namespace is this plugin's entry id. The active theme is
 * therefore read from the `config.active` reference handed to `apply` and written
 * back through `settings.update`, which persists into the profile patch and
 * commits the new value into that same reference. What remains to declare is that
 * this plugin ships its own page for the form.
 *
 * @param ctx - the plugin's context.
 * @param config - this entry's projected Config, carrying the live `active` reference.
 */
export function apply(ctx: Context, config: ThemesConfigType): void {
  const root = config.root ?? DEFAULT_THEMES_DIR;
  const catalogUrl = config.catalogUrl ?? DEFAULT_CATALOG_URL;
  declareCustomSettingsPage(ctx);

  mountThemeWeb(ctx, {
    home: resolveHome,
    root,
    catalogUrl,
    active: () => activeThemeId(config),
    setActive: async (id) => {
      const settings = ctx.get("settings");
      if (settings === undefined) throw new Error("themes: no settings service is mounted");
      await settings.update(NS, { active: id });
    },
  });

  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "exact",
          path: THEMES_ROUTE,
          handler: async (_req: IncomingMessage, res: ServerResponse) => {
            const home = resolveHome();
            const themes = await listInstalled(home, root);
            const body = JSON.stringify({
              active: activeThemeId(config),
              root,
              catalogUrl,
              themes,
            });
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(body);
          },
        }),
      "themes: themes route",
    );
  });
}
