/**
 * tweaks settings: the `tweaks` entry's own Config schema. Since 0.2.0 the
 * settings service projects a plugin's own Config out of the active profile's
 * entries and the namespace is the entry's own id, so this one schema is both
 * the deployment configuration the mirror bootstraps from and the entry's form.
 * There is no second section schema, and nothing to install for this one.
 *
 * **Neither field is volatile, and that is the classification, not an omission.**
 * `client.js` is this package's settings shell, and every control it offers
 * persists to `localStorage` — it reaches the settings API only for `describe()`
 * and `openDocument()`, and it names neither `homeRoot` nor `command` anywhere
 * in its source. So there is no user choice here to expose: the Stack's tweaks
 * surface is the shell's own rows, not a form over these two fields.
 * `check-plugin.mjs` asserts the absence, because at 0.2.0 a stray `.volatile()`
 * here would project a form for fields the launcher consumes before this process
 * exists, which no edit could ever take effect in.
 * @module tweaks/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";
import type { TweaksSection } from "./mirror.js";

/**
 * Settings namespace owning the state-folder + command section — this plugin's
 * own Loader entry id, so the form the service projects and the form a client
 * asks for cannot drift apart.
 */
export const NS = settingsNamespace("tweaks");

/** The `tweaks` entry's configuration, which is also its settings form. */
export type TweaksConfig = TweaksSection;

/**
 * `homeRoot` is where the launcher's state folders live and `command` is the
 * argv it falls back to for a bare `dsh`; `launcher/bin/dsh.mjs` reads both out
 * of the settings document before this process exists. Both are therefore
 * deployment facts an operator sets once per node — a volatile commit would not
 * remount this entry, so the mirror would never re-run and the write would
 * appear to save while the launcher kept reading the old value.
 *
 * Annotatable as `z<TweaksConfig>` because no field is a live reference.
 */
export const TweaksConfig: z<TweaksConfig> = z.object({
  homeRoot: z.string(),
  command: z.string(),
});
