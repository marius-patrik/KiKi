/**
 * agents settings: the `agents` section owns where authoring root
 * lives (the directory of JSON/MD persona files) and which shipped preset
 * materialized personas are composed from by default. The `dsh agents` CLI
 * and the plugin's boot/watch sync read the same section, so authoring and
 * runtime agree on where personas live and what base each gets.
 * @module agents/settings
 */

import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Settings namespace owning the persona authoring configuration — this
 * plugin's own Loader entry id, since 0.2.0 a form is the entry's own Config. */
export const NS = settingsNamespace("agents");

/** The authoring directory default: `<dshHome>/agents`. */
export const DEFAULT_ROOT = "agents";

/** The shipped preset personas are composed from by default. */
export const DEFAULT_BASE = "standard";

/** The user-writable slice: authoring root, default base preset, and the
 * persona a fresh session runs on when it has no live selection. */
export interface AgentSettings {
  /** Directory of JSON/MD persona files, relative to the dsh home or absolute. */
  root?: string;
  /** Preset id whose composition a persona with no `base` is composed from. */
  defaultBase?: string;
  /** Persona id resolved by `persona:policy` when a session has no selection. */
  defaultPersona?: string;
}

export const AgentSettings: z<AgentSettings> = z.object({
  root: z.string(),
  defaultBase: z.string(),
  defaultPersona: z.string(),
});

/**
 * Resolve the authoring directory: the settings value, else the deployment
 * Config value, else the `<dshHome>/agents` default. A relative settings
 * value resolves against the dsh home; an absolute one is used as-is.
 */
export function authoringRoot(
  home: string,
  settings?: AgentSettings,
  config?: AgentSettings,
): string {
  const value = settings?.root ?? config?.root ?? DEFAULT_ROOT;
  return value.startsWith("/") ? value : join(home, value);
}

/**
 * Resolve the default base preset: the settings value, else the deployment
 * Config value, else `standard`.
 */
export function defaultBase(settings?: AgentSettings, config?: AgentSettings): string {
  return settings?.defaultBase ?? config?.defaultBase ?? DEFAULT_BASE;
}

/**
 * Resolve the default persona: the settings value, else the deployment Config
 * value, else none. The `persona:policy` section renders it only when the
 * session has no live selection and no preset-derived persona.
 */
export function defaultPersona(
  settings?: AgentSettings,
  config?: AgentSettings,
): string | undefined {
  return settings?.defaultPersona ?? config?.defaultPersona;
}
