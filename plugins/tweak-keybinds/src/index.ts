/**
 * `tweak-keybinds`: the keybind settings surface — the `tweaks-keybinds`
 * section schema with validation, consumed by the client. Split out of the
 * bundled `tweaks` package.
 * @module tweak-keybinds
 */

import type { Context } from "@deepseek-ai/cordis";
import type z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { validateKeybinds } from "./keybinds.js";
import {
  NS_KEYBINDS,
  KeybindsConfig,
  type KeybindsConfig as KeybindsConfigType,
} from "./settings.js";

export { NS_KEYBINDS, KeybindEntry, KeybindsConfig } from "./settings.js";
export type {
  KeybindEntry as KeybindEntryType,
  KeybindsConfig as KeybindsConfigType,
} from "./settings.js";
export { validateKeybinds } from "./keybinds.js";

export const name = "tweak-keybinds";
export const inject: string[] = [];

/** The keybinds extension config: the keybinds section itself. */
export type Config = KeybindsConfigType;

export const Config: z<Config> = KeybindsConfig;

/**
 * apply implementation.
 *
 * The keybind form is the `KeybindsConfig` this plugin already declares, and its
 * namespace is this plugin's entry id, so there is nothing to install. The
 * chord invariants are checked here instead of on write: the settings service
 * validates a write against the schema alone, and an empty chord or an action
 * bound to two chords is a cross-entry rule no field schema can express.
 */
export function apply(ctx: Context, config: Config): void {
  const keybinds: KeybindsConfigType = {
    enabled: config?.enabled ?? true,
    keymap: config?.keymap ?? [],
  };
  validateKeybinds(keybinds.keymap);
  declareCustomSettingsPage(ctx);
}
