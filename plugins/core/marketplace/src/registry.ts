/**
 * The marketplace registry: a pure registration/aggregation service that
 * concrete marketplace-source extensions (`@dsh-stack/marketplace-source-<id>`,
 * e.g. `marketplace-source-dsh-stack`) plug their {@link MarketplaceSource}
 * into. Mirrors `packages/providers`'s `ProviderRegistry`: sources register
 * themselves against this service from their own `apply(ctx)`, and the
 * marketplace plugin itself owns no single source — every source is
 * contributed by its own extension.
 * @module marketplace/registry
 */

import type { Context } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import type { MarketplaceCatalogEntry, MarketplaceEntry } from "./entry.js";

/**
 * One marketplace source: something that can list installable Stack
 * plugins, extensions, or packs from some catalog (a release manifest, a
 * registry, a curated list, ...). A source is stateless from the registry's
 * perspective — {@link listEntries} is called fresh on every aggregation, so
 * a source that wants caching owns that caching itself.
 */
export interface MarketplaceSource {
  /** This source's id, unique among registered sources (e.g. `"dsh-stack"`). */
  readonly id: string;
  /** List the installable entries this source currently knows about. */
  listEntries(): Promise<readonly MarketplaceEntry[]>;
}

/**
 * The live catalog of registered marketplace sources. A registering
 * extension's disposer (the return value of {@link register}) withdraws its
 * source when that extension's fiber is disposed, so a hot-unloaded source
 * extension takes its entries out of aggregation with it.
 */
export class MarketplaceRegistry extends Service {
  private readonly sources = new Map<string, MarketplaceSource>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "marketplace");
  }

  /**
   * Register one marketplace source. Throws if a source with the same id is
   * already registered — two extensions cannot both own the same source id
   * — so the failure surfaces at boot rather than as a silently overwritten
   * source.
   * @returns a disposer that withdraws this source.
   */
  register(source: MarketplaceSource): () => void {
    if (this.sources.has(source.id)) {
      throw new Error(`marketplace: duplicate marketplace source "${source.id}"`);
    }
    this.sources.set(source.id, source);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.sources.delete(source.id);
    };
  }

  /** Whether a source with this id is currently registered. */
  has(id: string): boolean {
    return this.sources.has(id);
  }

  /** Every registered source id, in registration order. */
  sourceIds(): readonly string[] {
    return [...this.sources.keys()];
  }

  /**
   * Aggregate every registered source's entries into one flat catalog, each
   * entry attributed to the source that contributed it. Sources are queried
   * concurrently; a source whose `listEntries()` rejects fails the whole
   * aggregation (a marketplace listing should not silently omit a broken
   * source, since that source's install offers would appear more stable
   * than they are).
   */
  async listEntries(): Promise<readonly MarketplaceCatalogEntry[]> {
    const bySource = await Promise.all(
      [...this.sources.values()].map(async (source) => {
        const entries = await source.listEntries();
        return entries.map((entry) => ({ ...entry, sourceId: source.id }));
      }),
    );
    return bySource.flat();
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    marketplace: MarketplaceRegistry;
  }
}
