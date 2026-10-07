/**
 * agents settings: the `agents` entry's own Config schema, which is also its
 * settings form — since 0.2.0 the settings service projects a plugin's own
 * Config from the active profile's entries, so there is no second section
 * schema and the namespace is this plugin's entry id. The `dsh agents` CLI and
 * the plugin's boot/watch sync read the same values, so authoring and runtime
 * agree on where personas live and what base each gets.
 *
 * The authoring root and the default base preset are deployment facts: where
 * the persona files live and which shipped composition they compose from are
 * wiring an operator sets once, and neither is a choice a session makes. The
 * persona a fresh session runs on when it has no live selection is the user's
 * choice, so it alone is declared `.volatile()`, which makes it the only field
 * the settings service projects as this entry's form — an entry whose Config
 * declares no volatile field is omitted from `describe()` and refused by every
 * write.
 * @module agents/settings
 */

import type { Volatile } from "@deepseek-ai/cordis";
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

/** The plugin's configuration, which is also its settings form. */
export interface AgentSettings {
  /** Directory of JSON/MD persona files, relative to the dsh home or absolute. */
  root: string;
  /** Preset id whose composition a persona with no `base` is composed from. */
  defaultBase: string;
  /**
   * Persona id resolved by `persona:policy` when a session has no selection,
   * held as a live reference: the Loader commits every settings write into this
   * same object without remounting the plugin, so read it with `.get()` at each
   * use rather than capturing the value once.
   */
  defaultPersona: Volatile<string>;
}

/**
 * The same three values as a settings document carries them: plain strings, no
 * live reference. This is the shape the `dsh agents` CLI builds out of
 * `settings.yaml`; the plugin has no such layer of its own, because at 0.2.0
 * its Config is the only source of these values.
 */
export interface AgentSettingsSection {
  /** Directory of JSON/MD persona files, relative to the dsh home or absolute. */
  root?: string;
  /** Preset id whose composition a persona with no `base` is composed from. */
  defaultBase?: string;
  /** Persona id resolved by `persona:policy` when a session has no selection. */
  defaultPersona?: string;
}

export const AgentSettings = z.object({
  root: z.string().default(DEFAULT_ROOT),
  defaultBase: z.string().default(DEFAULT_BASE),
  defaultPersona: z.string().default("").volatile(),
});

/**
 * Resolve the authoring directory: the settings-document value, else the
 * deployment Config value, else the `<dshHome>/agents` default. A relative
 * value resolves against the dsh home; an absolute one is used as-is.
 */
export function authoringRoot(
  home: string,
  section?: AgentSettingsSection,
  config?: AgentSettings,
): string {
  const value = section?.root ?? config?.root ?? DEFAULT_ROOT;
  return value.startsWith("/") ? value : join(home, value);
}

/**
 * Resolve the default base preset: the settings-document value, else the
 * deployment Config value, else `standard`.
 */
export function defaultBase(section?: AgentSettingsSection, config?: AgentSettings): string {
  return section?.defaultBase ?? config?.defaultBase ?? DEFAULT_BASE;
}

/**
 * Resolve the default persona: the settings-document value, else the deployment
 * Config value read live out of its reference, else none. The `persona:policy`
 * section renders it only when the session has no live selection and no
 * preset-derived persona; an empty id means none.
 */
export function defaultPersona(
  section?: AgentSettingsSection,
  config?: AgentSettings,
): string | undefined {
  const value = section?.defaultPersona ?? config?.defaultPersona?.get() ?? "";
  return value === "" ? undefined : value;
}
