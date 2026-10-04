/**
 * `tweak-share-links`: self-hosted read-only share links — the
 * `<basePath>/<id>` snapshot route on the harness web server plus the
 * `tweaks-share` settings section. Split out of the bundled `tweaks`
 * package; plugs into the tweaks settings surface.
 * @module tweak-share-links
 */

import type { Context } from "@deepseek-ai/cordis";
import type z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { resolveHome } from "@dsh-stack/tweaks";
import { mountShareRoute } from "./share.js";
import { ShareConfig, type ShareConfig as ShareConfigType } from "./settings.js";

export { NS_SHARE, ShareConfig } from "./settings.js";
export type { ShareConfig as ShareConfigType } from "./settings.js";
export { generateToken, mountShareRoute, writeShareToken } from "./share.js";

export const name = "tweak-share-links";
export const inject: string[] = [];

/** The share-links extension config: the share section itself. */
export type Config = ShareConfigType;

export const Config: z<Config> = ShareConfig;

/**
 * apply implementation.
 *
 * The share-links form is the `ShareConfig` this plugin already declares, and its
 * namespace is this plugin's entry id, so there is nothing to install; what this
 * plugin must declare is that it ships its own page for that form. The read-only
 * share route is mounted from the same config, unchanged.
 *
 * @param ctx - the calling plugin's context.
 * @param config - the active profile's projected share-links fields.
 */
export function apply(ctx: Context, config: Config): void {
  const share: ShareConfigType = {
    enabled: config?.enabled ?? true,
    allowInteractive: config?.allowInteractive ?? false,
    advertisedHost: config?.advertisedHost ?? "",
    basePath: config?.basePath ?? "/share",
  };
  declareCustomSettingsPage(ctx);
  mountShareRoute(ctx, resolveHome(), share);
}
