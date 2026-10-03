/**
 * Settings-namespace declarations for Stack plugins and extensions.
 *
 * A settings form is not registered. Since 0.2.0 the settings service projects
 * volatile Config fields from the active profile's entries, so a plugin's own
 * schemastery `Config` is its form and the namespace is the entry's own id —
 * the value a plugin exports as `name`. A second hand-minted namespace per plugin
 * has no home, because one entry yields one form.
 *
 * A plugin that ships its own settings page declares that with
 * `configure({ auto: false }, ctx.fiber)`, registered as an effect inside an
 * optional `settings` inject child so the plugin still runs when the settings
 * service is absent.
 * @module plugin-kit/settings-section
 */

import type { Context } from "@deepseek-ai/cordis";
import type { SettingsNamespace } from "@deepseek-ai/dsh-settings";

export type { SettingsNamespace };

/**
 * Brand one Loader entry id as its settings-form namespace.
 *
 * The 0.2.0 namespace is the entry id, so this only re-brands a string the
 * plugin already owns; it does not create, register, or reserve anything. Pass
 * the same literal the plugin exports as `name`, so the form the service
 * projects and the form a client asks for cannot drift apart.
 *
 * @param entryId - the plugin's own entry id.
 * @returns the branded namespace for that entry.
 */
export function settingsNamespace(entryId: string): SettingsNamespace {
  return entryId as SettingsNamespace;
}

/**
 * Declare that the calling plugin ships its own page for the settings form its
 * Config projects, so a client never generates a schema page over it.
 *
 * The policy is registered against the calling plugin's fiber and owned by an
 * effect, so it is withdrawn with the plugin and re-applied if the settings
 * service is replaced.
 *
 * @param ctx - the calling plugin's context.
 */
export function declareCustomSettingsPage(ctx: Context): void {
  ctx.inject(["settings"], (settingsCtx) => {
    ctx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
  });
}