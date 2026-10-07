/**
 * Quota probes for providers this plugin does not own.
 *
 * The built-in probes cover the routes registered in `ctx.providers`. Everything else a
 * host registers — most importantly the custom OpenAI-compatible routes users
 * add through model settings, served by `llm-pi-ai` — had no probe at all, so
 * those rows carried no status light while every shipped route had one.
 *
 * A custom route describes itself in settings: the configurable-provider
 * directory gives the namespace and path of its profile, and the profile holds
 * the endpoint (`baseURL`) plus the credential reference (`apiKeyEnv`) it
 * resolves per request. That is enough to ask the same question the built-in
 * probes ask — does this endpoint accept this credential right now — instead of
 * reporting only whether a route exists.
 *
 * @module providers/quotas/configured
 */

import type { QuotaProvider, QuotaSnapshot } from "./index.js";
import type { ProbeTokenReader } from "./providers.js";
import {
  parseRateLimitHeaderNumber,
  parseRateLimitReset,
  rateLimitFields,
} from "./rate-limit-headers.js";

/** How long a configured-route probe may wait before it counts as unreachable. */
const PROBE_TIMEOUT_MS = 15_000;

/** One entry of the harness configurable-provider directory. */
export interface ConfigurableProviderEntry {
  provider: string;
  displayName: string;
  settingsNs: string;
  settingsPath: readonly string[];
}

/** One registered settings namespace and its resolved value. */
export interface SettingsDescriptorView {
  ns: string;
  value: unknown;
}

/** What a configured route needs to be probed, once its settings are read. */
export interface ConfiguredRouteProfile {
  /** Endpoint the route talks to; absent when the profile inherits one. */
  baseURL?: string;
  /** Credential reference the route resolves per request. */
  apiKeyEnv?: string;
}

/**
 * Read one configurable provider's profile out of the settings descriptors.
 *
 * `settingsPath` addresses the profile inside its namespace's value (an empty
 * path means the whole section), which is exactly how the owning adapter reads
 * it — so this stays correct without duplicating any provider's config schema.
 * @param entry - the directory entry naming the namespace and path.
 * @param descriptors - every registered namespace with its resolved value.
 * @returns the endpoint and credential reference, or undefined when unreadable.
 */
export function readConfiguredProfile(
  entry: ConfigurableProviderEntry,
  descriptors: readonly SettingsDescriptorView[],
): ConfiguredRouteProfile | undefined {
  const descriptor = descriptors.find((candidate) => candidate.ns === entry.settingsNs);
  if (descriptor === undefined) return undefined;
  let cursor: unknown = descriptor.value;
  for (const segment of entry.settingsPath) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor !== "object" || cursor === null) return undefined;
  const profile = cursor as Record<string, unknown>;
  const baseURL =
    typeof profile["baseURL"] === "string" && profile["baseURL"].length > 0
      ? profile["baseURL"]
      : undefined;
  const apiKeyEnv =
    typeof profile["apiKeyEnv"] === "string" && profile["apiKeyEnv"].length > 0
      ? profile["apiKeyEnv"]
      : undefined;
  return {
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
  };
}

/** The model-listing endpoint for a base URL, without doubling a trailing slash. */
export function modelsEndpoint(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, "")}/models`;
}

/**
 * Build one snapshot for a configured-route probe, carrying the directory
 * entry's human `displayName` through so a per-account breakdown in the
 * Settings UI (a numbered multi-account vendor like `openrouter-2`) can
 * label each account without a second lookup back into model settings.
 */
function snapshot(
  entry: ConfigurableProviderEntry,
  rest: Omit<QuotaSnapshot, "provider" | "displayName" | "fetchedAt">,
): QuotaSnapshot {
  return {
    provider: entry.provider,
    displayName: entry.displayName,
    fetchedAt: new Date().toISOString(),
    ...rest,
  };
}

/**
 * Probe one configured route's endpoint.
 * @param entry - the directory entry being probed.
 * @param profile - its endpoint and credential reference.
 * @param token - the resolved credential, when the profile named one.
 * @param fetchImpl - injectable fetch, for tests.
 * @returns the status snapshot.
 */
export async function probeConfiguredRoute(
  entry: ConfigurableProviderEntry,
  profile: ConfiguredRouteProfile,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<QuotaSnapshot> {
  if (profile.baseURL === undefined) {
    // A catalog route inherits its endpoint from the installed catalog, so
    // there is nothing here to probe. Saying so beats implying health.
    return snapshot(entry, {
      status: "unknown",
      source: "manual",
      message: "No endpoint configured for this route; nothing to verify.",
    });
  }
  if (profile.apiKeyEnv !== undefined && (token === undefined || token.length === 0)) {
    return snapshot(entry, {
      status: "unknown",
      source: "manual",
      message: `No credential configured (${profile.apiKeyEnv})`,
    });
  }
  try {
    const response = await fetchImpl(modelsEndpoint(profile.baseURL), {
      method: "GET",
      headers: {
        accept: "application/json",
        // A route with no credential reference is probed unauthenticated; local
        // endpoints (Ollama, LM Studio) legitimately need no key.
        ...(token === undefined || token.length === 0 ? {} : { authorization: `Bearer ${token}` }),
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // A custom gateway may still answer with the same generic
    // `x-ratelimit-*`/`retry-after` headers a first-party API uses, so a
    // multi-account vendor's meter bar and reset timer read real remaining
    // capacity instead of only ever showing a bare status light.
    const remaining = parseRateLimitHeaderNumber(response, "x-ratelimit-remaining");
    const limit = parseRateLimitHeaderNumber(response, "x-ratelimit-limit");
    const resetsAt = parseRateLimitReset(response);
    if (response.status === 200) {
      return snapshot(entry, {
        status: "available",
        source: "endpoint",
        message: `${entry.displayName} healthy`,
        ...rateLimitFields(remaining, limit, resetsAt),
      });
    }
    if (response.status === 401) {
      return snapshot(entry, {
        status: "error",
        source: "endpoint",
        message: "Auth failed — the endpoint rejected this credential",
      });
    }
    if (response.status === 403) {
      return snapshot(entry, {
        status: "error",
        source: "endpoint",
        message: "Quota exhausted or access denied",
      });
    }
    if (response.status === 429) {
      return snapshot(entry, {
        status: "error",
        source: "endpoint",
        message: `Rate limited${resetsAt !== undefined ? ` — resets ${new Date(resetsAt).toLocaleTimeString()}` : ""}`,
        ...rateLimitFields(remaining, limit, resetsAt),
      });
    }
    if (response.status === 404) {
      // Plenty of gateways serve completions without a listing endpoint; that
      // is not a credential problem and must not be reported as one.
      return snapshot(entry, {
        status: "unknown",
        source: "endpoint",
        message: "Endpoint serves no model listing; status cannot be verified.",
      });
    }
    return snapshot(entry, {
      status: "unknown",
      source: "endpoint",
      message: `HTTP ${response.status}`,
    });
  } catch (error) {
    return snapshot(entry, {
      status: "error",
      source: "endpoint",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Hooks the configured-route probes read the live host state through. */
export interface ConfiguredProbeDeps {
  /** The harness configurable-provider directory. */
  listConfigurable: () => readonly ConfigurableProviderEntry[];
  /** Every registered settings namespace with its resolved value. */
  describeSettings: () => readonly SettingsDescriptorView[];
  /** Resolve a credential reference to its secret. */
  readToken: ProbeTokenReader;
  /** Providers already covered by a built-in probe. */
  covered: (provider: string) => boolean;
  /** Injectable fetch, for tests. */
  fetch?: typeof fetch;
}

/**
 * Build a probe for every configured provider that has no built-in one.
 *
 * Rebuilt on demand rather than once at boot: a user adding a custom provider
 * in model settings must get a light without restarting, and the directory is
 * what changes.
 * @param deps - live host hooks.
 * @returns one quota provider per uncovered configured route.
 */
export function createConfiguredProviders(deps: ConfiguredProbeDeps): QuotaProvider[] {
  const providers: QuotaProvider[] = [];
  const descriptors = deps.describeSettings();
  for (const entry of deps.listConfigurable()) {
    if (deps.covered(entry.provider)) continue;
    // The directory declares every route an adapter *could* activate, most of
    // which are catalog entries nobody configured. Probing those would fill the
    // panel with rows that only say "not configured" — the light belongs to
    // routes that actually name an endpoint, which is what a custom provider
    // does. A route configured later is picked up on the next sync.
    if (readConfiguredProfile(entry, descriptors)?.baseURL === undefined) continue;
    providers.push({
      id: entry.provider,
      /** read implementation. */
      async read(signal): Promise<QuotaSnapshot> {
        if (signal.aborted) {
          return snapshot(entry, {
            status: "unknown",
            source: "manual",
            message: "Probe aborted",
          });
        }
        // Read settings at probe time: an endpoint or credential edited since
        // the last probe must be what this one checks.
        const profile = readConfiguredProfile(entry, deps.describeSettings());
        if (profile === undefined) {
          return snapshot(entry, {
            status: "unknown",
            source: "manual",
            message: "No stored configuration found for this route.",
          });
        }
        const token =
          profile.apiKeyEnv === undefined ? undefined : await deps.readToken(profile.apiKeyEnv);
        return probeConfiguredRoute(entry, profile, token, deps.fetch);
      },
    });
  }
  return providers;
}
