/**
 * The provider registry: a pure registration/discovery service that concrete
 * provider extensions (`@dsh-stack/provider-<id>`) plug their `ProviderRoute`
 * into. `providers` itself no longer declares any single route — every route
 * is contributed by its own extension, calling `ctx.providers.register(...)`
 * from that extension's `apply(ctx)`. This mirrors the `agents` preset
 * abstraction (`AgentPresetResource` registered against the `agents` plugin
 * by `agent-preset-coding`/`agent-preset-default`), applied to provider
 * routes instead of preset compositions.
 * @module providers/registry
 */

import type { Context } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "./providers.js";

/**
 * The live catalog of registered provider routes. A registering extension's
 * disposer (the return value of {@link register}) withdraws its route when
 * that extension's fiber is disposed, so a hot-unloaded extension takes its
 * route out of discovery and dispatch with it.
 */
export class ProviderRegistry extends Service {
  private readonly routes = new Map<string, ProviderRoute>();
  private readonly listeners = new Set<() => void>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "providers");
  }

  /**
   * Register one provider route. Throws if a route with the same id is
   * already registered — two extensions cannot both own the same provider
   * id — so the failure surfaces at boot rather than as a silently
   * overwritten route.
   * @returns a disposer that withdraws this route.
   */
  register(route: ProviderRoute): () => void {
    if (this.routes.has(route.id)) {
      throw new Error(`providers: duplicate provider route "${route.id}"`);
    }
    this.routes.set(route.id, route);
    this.notify();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.routes.delete(route.id);
      this.notify();
    };
  }

  /** Look up a route by id; throws on unknown ids. */
  get(id: string): ProviderRoute {
    const route = this.routes.get(id);
    if (route === undefined) throw new Error(`providers: unknown provider route "${id}"`);
    return route;
  }

  /** Whether a route with this id is currently registered. */
  has(id: string): boolean {
    return this.routes.has(id);
  }

  /** Every registered route, in registration order. */
  list(): readonly ProviderRoute[] {
    return [...this.routes.values()];
  }

  /** Every registered provider id, in registration order. */
  ids(): readonly string[] {
    return [...this.routes.keys()];
  }

  /**
   * Subscribe to registry changes (a route registered or withdrawn).
   * @returns an unsubscribe function.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** notify implementation. */
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    providers: ProviderRegistry;
  }
}
