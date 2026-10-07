/**
 * tweak-keybinds validation: the settings `validate` hook logic for keybind
 * entries.
 * @module tweak-keybinds/keybinds
 */

import type { KeybindEntry } from "./settings.js";

/** Validate a keybind entry list (used by the settings `validate` hook). */
export function validateKeybinds(entries: KeybindEntry[]): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    if (entry.keys.trim().length === 0) {
      throw new Error(`keybind "${entry.action}" has an empty chord`);
    }
    const prior = seen.get(entry.action);
    if (prior !== undefined && prior !== entry.keys) {
      throw new Error(`keybind action "${entry.action}" bound twice (${prior} vs ${entry.keys})`);
    }
    seen.set(entry.action, entry.keys);
  }
}
