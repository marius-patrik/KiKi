/**
 * tweak-keybinds settings: the keybind settings surface schema — a keymap of
 * action → chord consumed by the client.
 * @module tweak-keybinds/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Namespace of the keybind section — this plugin's own Loader entry id. */
export const NS_KEYBINDS = settingsNamespace("tweak-keybinds");

/** One keybind: a named action bound to a key chord. */
export interface KeybindEntry {
  /** The action id (e.g. `plan.toggle`, `undo`, `redo`). */
  action: string;
  /** The key chord (e.g. `mod+t`, `alt+u`). */
  keys: string;
  /** Optional per-keymap override (default keymap implied when absent). */
  when?: string;
}

export const KeybindEntry: z<KeybindEntry> = z.object({
  action: z.string(),
  keys: z.string(),
  when: z.string(),
});

/** The keybind section: a keymap of action → chord. */
export interface KeybindsConfig {
  enabled: boolean;
  keymap: KeybindEntry[];
}

export const KeybindsConfig: z<KeybindsConfig> = z.object({
  enabled: z.boolean().default(true),
  keymap: z.array(KeybindEntry).default([]),
});
