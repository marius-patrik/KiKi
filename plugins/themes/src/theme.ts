/**
 * Theme conversion: map a VS Code / TextMate theme source into the dsh theme
 * registry shape (`ThemeDefinition`: id, colorScheme, alias-token overrides).
 * The web UI exposes a fixed set of semantic tokens (`--dsw-alias-*`); a
 * source theme's concrete colors are best-effort mapped onto those roles so a
 * theme can change the whole palette through the same override layer the
 * browser registry applies. Unmapped VS Code keys fall back to sensible
 * defaults per color scheme so a theme never renders unreadable.
 * @module themes/theme
 */

/** The token keys the dsh web UI exposes for override (see ui-theme inspection). */
export const ALIAS_TOKENS = [
  "--dsw-alias-bg-base",
  "--dsw-alias-bg-layer-1",
  "--dsw-alias-bg-layer-2",
  "--dsw-alias-bg-overlay",
  "--dsw-alias-border-l1",
  "--dsw-alias-border-l2",
  "--dsw-alias-brand-primary",
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-state-error-primary",
  "--dsw-alias-state-success-primary",
  "--dsw-alias-state-warn-primary",
  "--dsw-specific-sidebar-fill",
] as const;

export type AliasToken = (typeof ALIAS_TOKENS)[number];

/** The registered-theme shape the browser `ctx.theme.register` consumes. */
export interface ThemeDefinition {
  id: string;
  colorScheme: "light" | "dark";
  tokens: Record<string, string>;
}

/** A parsed theme source before mapping (VS Code theme JSON or tmTheme XML). */
export interface ThemeSource {
  /** Source theme name (used for the id when none is pinned). */
  name: string;
  /** `dark`, `light`, or `hc` (high-contrast counted as dark). */
  type: "dark" | "light" | "hc";
  /** VS Code color keys → color strings (already normalized to tmTheme keys). */
  colors: Record<string, string>;
}

/** Normalize `#rgb`/`#rrggbbaa` to `#rrggbb`, keep everything else verbatim. */
export function normalizeColor(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${[...hex.slice(1)].map((ch) => ch + ch).join("")}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  return value;
}

/** tmTheme color-key → VS Code color-key alias (the tmTheme XML uses short keys). */
const TM_KEY_ALIASES: Record<string, string> = {
  background: "editor.background",
  foreground: "editor.foreground",
  caret: "editor.foreground",
  selection: "editor.selectionBackground",
  findHighlight: "editor.findMatchHighlightBackground",
  lineHighlight: "editor.lineHighlightBackground",
  comment: "editor.foreground",
  bracketForeground: "editor.foreground",
  guide: "editorIndentGuide.background",
  inactiveSelection: "editor.inactiveSelectionBackground",
  wordHighlight: "editor.wordHighlightBackground",
};

/** VS Code color-key → dsh alias-token role, with per-scheme fallbacks. */
const KEY_TO_TOKEN: Array<[string, AliasToken]> = [
  ["editor.background", "--dsw-alias-bg-base"],
  ["editorWidget.background", "--dsw-alias-bg-overlay"],
  ["sideBar.background", "--dsw-specific-sidebar-fill"],
  ["editorGroupHeader.tabsBackground", "--dsw-alias-bg-layer-1"],
  ["activityBar.background", "--dsw-alias-bg-layer-2"],
  ["input.background", "--dsw-alias-bg-layer-1"],
  ["editor.foreground", "--dsw-alias-label-primary"],
  ["descriptionForeground", "--dsw-alias-label-secondary"],
  ["textLink.foreground", "--dsw-alias-brand-primary"],
  ["editorError.foreground", "--dsw-alias-state-error-primary"],
  ["editorWarning.foreground", "--dsw-alias-state-warn-primary"],
  ["editorInfo.foreground", "--dsw-alias-state-success-primary"],
  ["gitDecoration.addedResourceForeground", "--dsw-alias-state-success-primary"],
  ["editor.findMatchHighlightBackground", "--dsw-alias-border-l2"],
  ["editor.lineHighlightBackground", "--dsw-alias-bg-layer-1"],
  ["editor.selectionBackground", "--dsw-alias-brand-primary"],
  ["editorIndentGuide.background", "--dsw-alias-border-l1"],
];

/** A fallback per scheme when the source supplies no value for a token role. */
export const TOKEN_FALLBACKS: Record<AliasToken, Record<"light" | "dark", string>> = {
  "--dsw-alias-bg-base": { light: "#ffffff", dark: "#101418" },
  "--dsw-alias-bg-layer-1": { light: "#f5f6f8", dark: "#161b21" },
  "--dsw-alias-bg-layer-2": { light: "#eceef1", dark: "#1c222a" },
  "--dsw-alias-bg-overlay": { light: "#ffffff", dark: "#20272f" },
  "--dsw-alias-border-l1": { light: "#e2e5ea", dark: "#2c343e" },
  "--dsw-alias-border-l2": { light: "#cdd2d9", dark: "#3a4450" },
  "--dsw-alias-brand-primary": { light: "#2563eb", dark: "#4c8dff" },
  "--dsw-alias-label-primary": { light: "#1f2933", dark: "#d6dee8" },
  "--dsw-alias-label-secondary": { light: "#5a6675", dark: "#8b97a6" },
  "--dsw-alias-state-error-primary": { light: "#dc2626", dark: "#ff6188" },
  "--dsw-alias-state-success-primary": { light: "#16a34a", dark: "#a9dc76" },
  "--dsw-alias-state-warn-primary": { light: "#d97706", dark: "#ffd866" },
  "--dsw-specific-sidebar-fill": { light: "#f5f6f8", dark: "#161b21" },
};

/** Derive a registry-safe id from a theme name. */
export function themeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "theme";
}

/**
 * Map a parsed source onto a dsh ThemeDefinition. Every alias token is filled
 * (source value when present, else the scheme fallback) so the override layer
 * is complete and legible in both base palettes.
 * @param source - the parsed theme source.
 * @param id - the pinned id (defaults to {@link themeId} of the source name).
 * @returns the registry-ready definition.
 */
export function mapTheme(source: ThemeSource, id: string = themeId(source.name)): ThemeDefinition {
  const scheme: "light" | "dark" = source.type === "light" ? "light" : "dark";
  const tokens: Record<string, string> = {};
  for (const token of ALIAS_TOKENS) {
    let value: string | undefined;
    for (const [key, role] of KEY_TO_TOKEN) {
      if (role !== token) continue;
      const sourceValue = source.colors[key];
      if (sourceValue === undefined) continue;
      value = normalizeColor(sourceValue);
      break;
    }
    tokens[token] = value ?? TOKEN_FALLBACKS[token][scheme];
  }
  return { id, colorScheme: scheme, tokens };
}

/**
 * Parse a VS Code theme JSON document.
 * @param text - the JSON text.
 * @param nameOverride - pinned name when the JSON lacks one.
 * @throws on malformed JSON or a missing/unknown `type`.
 */
export function parseVsCodeTheme(text: string, nameOverride?: string): ThemeSource {
  const json = JSON.parse(text) as Record<string, unknown>;
  const type = typeof json.type === "string" ? json.type : "dark";
  if (type !== "light" && type !== "dark" && type !== "hc") {
    throw new Error(`themes: unsupported theme type "${type}"`);
  }
  const name = typeof json.name === "string" ? json.name : (nameOverride ?? "theme");
  const colors =
    json.colors !== null && typeof json.colors === "object"
      ? (json.colors as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === "string") out[key] = value;
  }
  return { name, type, colors: out };
}

/** TextMate setting keys that contribute a concrete color (not a scope rule). */
const TM_SETTING_KEYS = ["background", "foreground", "caret", "selection"] as const;

/**
 * Parse a TextMate `.tmTheme` XML document: pull the named color settings
 * (background/foreground/caret/selection) and alias them onto VS Code keys.
 * @param text - the XML text.
 * @returns the parsed source with VS Code key aliases.
 */
export function parseTmThemeXml(text: string): ThemeSource {
  let name = "TextMate Theme";
  const colors: Record<string, string> = {};
  const nameMatch = /<key>\s*name\s*<\/key>\s*<string>([^<]*)<\/string>/.exec(text);
  if (nameMatch?.[1] !== undefined) name = nameMatch[1];
  const settingsMatch = /<key>\s*settings\s*<\/key>\s*<dict>([\s\S]*?)<\/dict>\s*<\/dict>/.exec(
    text,
  );
  const body = settingsMatch?.[1] ?? text;
  for (const key of TM_SETTING_KEYS) {
    const re = new RegExp(`<key>\\s*${key}\\s*<\\/key>\\s*<string>([^<]*)<\\/string>`);
    const match = re.exec(body);
    if (match?.[1] === undefined) continue;
    const alias = TM_KEY_ALIASES[key];
    if (alias !== undefined) colors[alias] = match[1];
  }
  return { name, type: inferScheme(colors), colors };
}

/** Infer a scheme from a tmTheme's background (no explicit type in XML). */
function inferScheme(colors: Record<string, string>): ThemeSource["type"] {
  const bg = colors["editor.background"];
  if (bg === undefined) return "dark";
  const rgb = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(bg);
  if (rgb === null || rgb[1] === undefined || rgb[2] === undefined || rgb[3] === undefined)
    return "dark";
  const luminance =
    parseInt(rgb[1], 16) * 0.299 + parseInt(rgb[2], 16) * 0.587 + parseInt(rgb[3], 16) * 0.114;
  return luminance > 127.5 ? "light" : "dark";
}
