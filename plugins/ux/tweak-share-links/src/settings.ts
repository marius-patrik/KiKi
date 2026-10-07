/**
 * tweak-share-links settings: the share-links section schema shared between
 * the composition entry, the settings document, and the `dsh share` verb.
 * @module tweak-share-links/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Namespace of the share-links section — this plugin's own Loader entry id. */
export const NS_SHARE = settingsNamespace("tweak-share-links");

/** One self-hosted share-link configuration. */
export interface ShareConfig {
  /** Whether the read-only share route is mounted at all. */
  enabled: boolean;
  /** Whether interactive (token-gated) sharing is allowed for this deployment. */
  allowInteractive: boolean;
  /** Hosts the share link advertises (Tailscale name etc.); empty = loopback. */
  advertisedHost?: string;
  /** Base path the share route mounts under (default `/share`). */
  basePath: string;
}

export const ShareConfig: z<ShareConfig> = z.object({
  enabled: z.boolean().default(true),
  allowInteractive: z.boolean().default(false),
  advertisedHost: z.string().default(""),
  basePath: z.string().default("/share"),
});
