/**
 * themes settings: the `themes` entry's own Config schema. The themes directory
 * and catalog base are deployment facts; the active theme is the user's choice,
 * so it is declared `.volatile()` and becomes the only field the settings service
 * projects as this entry's form.
 * @module themes/settings
 */

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Settings namespace owning the active-theme choice — this plugin's own entry id. */
export const NS = settingsNamespace("themes");

/** The default directory (under the agent home) installed themes live in. */
export const DEFAULT_THEMES_DIR = "themes";

/** The default Open VSX catalog base the search/download verbs hit. */
export const DEFAULT_CATALOG_URL = "https://open-vsx.org";

/** The plugin's configuration. */
export interface ThemesConfig {
  /** Directory (relative to the agent home, or absolute) holding theme files. */
  root: string;
  /** Open VSX catalog base URL for `dsh theme search` / `dsh theme install`. */
  catalogUrl: string;
  /**
   * The active theme id, or empty for the built-in light/dark/system
   * preference, held as a live reference: the Loader commits every settings
   * write into this same object, so read it with `.get()` at each use rather
   * than capturing the value once.
   */
  active: Volatile<string>;
}

export const ThemesConfig = z.object({
  root: z.string().default(DEFAULT_THEMES_DIR),
  catalogUrl: z.string().default(DEFAULT_CATALOG_URL),
  active: z.string().default("").volatile(),
});
