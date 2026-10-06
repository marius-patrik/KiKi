/**
 * The quotas half of providers (merged from the standalone dsh-quotas
 * plugin): a registry of quota providers, one snapshot per provider, the
 * `/quotas/api/*` web routes with the HTML dashboard, and the built-in probe
 * providers with a staggered 15-minute auto-refresh.
 *
 * It registers no settings form. Since 0.2.0 one Loader entry yields exactly one
 * form, and the `providers` entry already owns that one, so the former
 * `dsh-quotas` namespace and its `QuotaSettings` schema are deleted rather than
 * bridged: nothing in the workspace named `dsh-quotas` but this file, and the two
 * fields it declared (`enabled`, `refreshMinutes`) had no reader anywhere — the
 * refresh interval below is the plugin's own deployment constant, not a setting.
 * What the plugin passes in is wiring, not configuration.
 * @module providers/quotas
 */

import type { Context } from "@deepseek-ai/cordis";
import type { AccountsService } from "@dsh-stack/credential-vault";
import { mountQuotaWeb } from "./web/index.js";
import { createBuiltinProviders } from "./providers.js";
import { createConfiguredProviders } from "./configured.js";
import type { ConfigurableProviderEntry, SettingsDescriptorView } from "./configured.js";

export { QUOTAS_PREFIX, mountQuotaWeb } from "./web/index.js";
export { createBuiltinProviders } from "./providers.js";
export {
  createConfiguredProviders,
  probeConfiguredRoute,
  readConfiguredProfile,
  modelsEndpoint,
} from "./configured.js";
export type {
  ConfigurableProviderEntry,
  ConfiguredProbeDeps,
  ConfiguredRouteProfile,
  SettingsDescriptorView,
} from "./configured.js";

export interface QuotaSnapshot {
  provider: string;
  /**
   * Human label for this provider (a route's `displayName`, or a configured
   * route's directory entry name). Lets a per-account breakdown for a
   * numbered multi-account vendor (`openrouter-2`, ...) show a name instead
   * of the bare id, without a second lookup back into model settings.
   */
  displayName?: string;
  status: "available" | "unknown" | "error";
  used?: number;
  limit?: number;
  remaining?: number;
  unit?: "tokens" | "requests" | "credits" | "currency";
  window?: string;
  resetsAt?: string;
  fetchedAt: string;
  source: "endpoint" | "cli" | "manual";
  message?: string;
}

export interface QuotaProvider {
  readonly id: string;
  read(signal: { readonly aborted: boolean }): Promise<QuotaSnapshot>;
}

export class QuotaRegistry {
  private readonly providers = new Map<string, QuotaProvider>();
  private readonly snapshots = new Map<string, QuotaSnapshot>();

  /** register implementation. */
  register(provider: QuotaProvider): () => void {
    this.providers.set(provider.id, provider);
    return () => {
      if (this.providers.get(provider.id) === provider) this.providers.delete(provider.id);
    };
  }

  /**
   * Returns the snapshot for the given provider if it exists, or undefined if not found.
   *
   * @param provider - The identifier for the quota provider.
   * @returns The QuotaSnapshot for the provider, or undefined if no snapshot exists.
   */
  snapshot(provider: string): QuotaSnapshot | undefined {
    return this.snapshots.get(provider);
  }

  /**
   * Returns an array of all QuotaSnapshot instances.
   *
   * @returns An array of QuotaSnapshot objects representing the current snapshots.
   */
  all(): readonly QuotaSnapshot[] {
    return [...this.snapshots.values()];
  }

  /** refresh implementation. */
  async refresh(
    provider: string,
    signal: { readonly aborted: boolean } = { aborted: false },
  ): Promise<QuotaSnapshot> {
    const source = this.providers.get(provider);
    if (source === undefined) {
      const unknown: QuotaSnapshot = {
        provider,
        status: "unknown",
        fetchedAt: new Date().toISOString(),
        source: "manual",
        message: "No verified quota source is configured for this provider.",
      };
      this.snapshots.set(provider, unknown);
      return unknown;
    }
    try {
      const snapshot = await source.read(signal);
      this.snapshots.set(provider, snapshot);
      return snapshot;
    } catch (error) {
      const failed: QuotaSnapshot = {
        provider,
        status: "error",
        fetchedAt: new Date().toISOString(),
        source: "manual",
        message: error instanceof Error ? error.message : String(error),
      };
      this.snapshots.set(provider, failed);
      return failed;
    }
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    quotas: QuotaRegistry;
  }
}

/** How the quotas half is wired by its owner plugin. */
export interface QuotasConfig {
  /**
   * Resolve one probe credential. Defaults to reading the account seam as
   * stored, which is wrong for a subscription route: its access token is
   * short-lived (Kimi's lasts 15 minutes), so a probe reading the stored value
   * reports "Auth failed" for a provider that dispatch refreshes and serves
   * perfectly. The plugin passes a reader that refreshes exactly as dispatch
   * does, so the light reflects whether the credential works rather than how
   * long ago it was written.
   */
  resolveToken?: (ref: string) => Promise<string | undefined>;
}

/**
 * Resolve one credential reference for a probe: the account seam
 * (credentials) first, then the credential environment variable as the
 * fallback. Probes never read vault files directly.
 */
async function resolveProbeToken(ctx: Context, ref: string): Promise<string | undefined> {
  const accounts = ctx.get("accounts") as AccountsService | undefined;
  if (accounts !== undefined) {
    const resolved = await accounts.resolve(ref);
    if (resolved?.value !== undefined && resolved.value.length > 0) return resolved.value;
  }
  return process.env[ref] ?? undefined;
}

/**
 * Mount the quotas registry, web routes, and the built-in probe providers with
 * their staggered 15-minute auto-refresh.
 *
 * @param ctx - the owning plugin's context.
 * @param config - the wiring its owner passes down; see {@link QuotasConfig}.
 * @returns the mounted registry, provided as `ctx.quotas`.
 */
export function applyQuotas(ctx: Context, config: QuotasConfig = {}): QuotaRegistry {
  const registry = new QuotaRegistry();
  ctx.provide("quotas", registry);
  mountQuotaWeb(ctx, registry);

  const read =
    config.resolveToken ??
    ((ref: string): Promise<string | undefined> => resolveProbeToken(ctx, ref));
  const disposers: Array<() => void> = [];

  // Built-in providers derive from whatever routes `@dsh-stack/provider-<id>`
  // extensions have registered into `ctx.providers` — possibly none yet at
  // this call (this runs from the `providers` plugin's own `apply`, before
  // its extensions' `apply` has run). `syncBuiltinProviders` re-derives the
  // set each time it is called and only ever adds a route it has not already
  // registered, so a route that registers after this plugin mounted still
  // gets probed without needing a restart.
  const builtinIds = new Set<string>();
  /**
   * Syncs built-in provider routes by registering new routes not already registered.
   * Ensures that any new built-in providers added to `ctx.providers` are probed
   * without requiring a restart. This function does not return any value but
   * updates the `disposers` and `builtinIds` as side effects.
   */
  const syncBuiltinProviders = (): void => {
    const routes = ctx.providers.list();
    for (const provider of createBuiltinProviders(read, routes)) {
      if (builtinIds.has(provider.id)) continue;
      disposers.push(registry.register(provider));
      builtinIds.add(provider.id);
    }
  };
  syncBuiltinProviders();
  ctx.providers.onChange(syncBuiltinProviders);

  // Providers this plugin does not own — above all the custom
  // OpenAI-compatible routes added through model settings — get a probe too, so
  // every row in a status surface carries a light instead of only the shipped
  // ones. Re-synced before each refresh because the directory changes while the
  // host runs: adding a custom provider must not need a restart to be probed.
  // Every route this plugin owns is covered, not merely the probed ones: an
  // owned route without a probe (kimi-code) must not fall through to the
  // generic prober, which would read the plugin's own settings section, find no
  // baseURL there, and report "no endpoint configured" about a route whose
  // endpoint is declared in code.
  /**
   * Determines if a route is covered by this plugin.
   *
   * Guarantees:
   * - Returns true if the candidate route is either owned by the plugin or
   *   configured as a provider.
   * - Ensures that every owned route is covered, even if it lacks a probe.
   *
   * Fails:
   * - Returns false for routes not owned or configured by the plugin.
   */
  const covered = (candidate: string): boolean =>
    builtinIds.has(candidate) || ctx.providers.has(candidate);
  const configuredIds = new Set<string>();
  /**
   * Synchronizes configured provider IDs with the current context.
   *
   * Guarantees:
   * - Updates the set of configured provider IDs to match the current context.
   * - Ensures that all providers explicitly configured are included in the set.
   *
   * Fails:
   * - Does nothing if no changes are detected between the current and previous
   *   context states.
   */
  const syncConfiguredProviders = (): void => {
    const llm = ctx.get("llm") as
      | {
          listConfigurableProviders?: () => readonly ConfigurableProviderEntry[];
        }
      | undefined;
    const settingsProvider = ctx.get("settings") as
      | {
          describe?: (options?: { redactSecrets?: boolean }) => readonly SettingsDescriptorView[];
        }
      | undefined;
    if (llm?.listConfigurableProviders === undefined || settingsProvider?.describe === undefined)
      return;
    const listConfigurable = llm.listConfigurableProviders.bind(llm);
    const describe = settingsProvider.describe.bind(settingsProvider);
    for (const provider of createConfiguredProviders({
      listConfigurable,
      // Verbatim, not redacted: the probe needs the real credential reference,
      // and this read never leaves the process.
      describeSettings: () => describe(),
      readToken: read,
      covered,
    })) {
      disposers.push(registry.register(provider));
      configuredIds.add(provider.id);
    }
  };
  syncConfiguredProviders();

  /** Every provider the registry should refresh on a cycle. */
  const probeIds = (): string[] => {
    syncBuiltinProviders();
    syncConfiguredProviders();
    return [...builtinIds, ...configuredIds];
  };

  // Initial refresh (staggered by 500ms each to avoid thundering herd)
  const controller = new AbortController();
  const initial: ReturnType<typeof setTimeout>[] = [];
  for (const [i, id] of probeIds().entries()) {
    const timeout = setTimeout(async () => {
      if (controller.signal.aborted) return;
      try {
        await registry.refresh(id, controller.signal);
      } catch {
        /* swallow */
      }
    }, i * 500);
    timeout.unref();
    initial.push(timeout);
  }

  // Periodic auto-refresh, every 15 minutes. A deployment fact rather than a
  // setting: it is the provider's own rate-limit window, so it is a constant here
  // instead of a field on a schema no client could edit.
  const refreshMinutes = 15;
  const timer = setInterval(() => {
    for (const [i, id] of probeIds().entries()) {
      const timeout = setTimeout(async () => {
        try {
          await registry.refresh(id);
        } catch {
          /* swallow */
        }
      }, i * 500);
      timeout.unref();
    }
  }, refreshMinutes * 60_000);
  timer.unref();

  (ctx.on as (event: string, listener: () => void) => void)("dispose", () => {
    controller.abort();
    for (const timeout of initial) clearTimeout(timeout);
    clearInterval(timer);
    for (const d of disposers) d();
  });
  return registry;
}
