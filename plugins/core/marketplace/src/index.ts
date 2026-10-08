/**
 * `marketplace`: the abstraction/registry layer for "marketplace sources" —
 * something that lists installable Stack plugins, extensions, and packs.
 * This plugin owns no single source itself; every source (the Stack's own
 * release catalog, and any future third-party catalog) is contributed by
 * its own `@dsh-stack/marketplace-source-<id>` extension registering a
 * {@link MarketplaceSource} against {@link MarketplaceRegistry}. This
 * mirrors the `providers` plugin/`provider-<id>` extension split applied to
 * installable-catalog sources instead of LLM provider routes.
 * @module marketplace
 */

import type { Context } from "@deepseek-ai/cordis";
import { MarketplaceRegistry } from "./registry.js";

export type {
  MarketplaceCatalogEntry,
  MarketplaceDependencyRef,
  MarketplaceEntry,
  MarketplaceEntryKind,
  MarketplaceInstallSource,
} from "./entry.js";
export { MarketplaceRegistry, type MarketplaceSource } from "./registry.js";

export const name = "marketplace";
export const inject: readonly string[] = [];

/** apply implementation. */
export function apply(ctx: Context): void {
  new MarketplaceRegistry(ctx);
}
