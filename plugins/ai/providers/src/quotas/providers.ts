/**
 * Built-in quota providers for the dsh subscription and API-key providers.
 *
 * Each provider makes a lightweight probe request against the real endpoint
 * and reports the HTTP status as quota availability. Probe routes derive from
 * whatever `@dsh-stack/provider-<id>` extensions have registered into the
 * `providers` registry at the moment {@link createBuiltinProviders} runs: a
 * route's probe endpoint is the per-route `probe` extension field, its fixed
 * headers and display name come from the route itself, and its token
 * reference is the route's first credential slot. Probe tokens resolve
 * through the account seam (credentials) with the credential environment
 * variable as fallback — the probes never read vault files directly.
 *
 * @module providers/quotas/providers
 */

import type { ProviderRoute } from "../providers.js";
import type { QuotaProvider, QuotaSnapshot } from "./index.js";
import {
  parseRateLimitHeaderNumber,
  parseRateLimitReset,
  rateLimitFields,
} from "./rate-limit-headers.js";

/** Resolve one credential reference to its secret value, or undefined. */
export type ProbeTokenReader = (ref: string) => Promise<string | undefined>;

/** One probeable route: a provider route with a probe extension. */
type ProbeRoute = ProviderRoute & { probe: NonNullable<ProviderRoute["probe"]> };

/** Every provider route that declares a quota probe, in registration order. */
function probeRoutes(routes: readonly ProviderRoute[]): readonly ProbeRoute[] {
  return routes.filter((route): route is ProbeRoute => route.probe !== undefined);
}

/** The credential reference a probe authenticates with: the route's first slot. */
function probeTokenRef(route: ProbeRoute): string | undefined {
  const slot = route.authSlots[0];
  return slot?.ref;
}

/* -------------------------------------------------------------------------- */
/* Probe implementation                                                       */
/* -------------------------------------------------------------------------- */

/** Whether an endpoint is Anthropic's, which requires a version header. */
function isAnthropic(url: string): boolean {
  try {
    return new URL(url).hostname === "api.anthropic.com";
  } catch {
    return false;
  }
}

/** How long a quota probe may wait before it is reported as unreachable. */
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Probes an endpoint with the given route and authentication token.
 *
 * Guarantees a `QuotaSnapshot` if the probe is successful, otherwise returns a rejected Promise.
 *
 * @param route - The configuration for the probe, including the URL and headers.
 * @param token - The authentication token used for the probe.
 * @returns A Promise resolving to a `QuotaSnapshot` on success, or rejecting on failure.
 */
async function probeEndpoint(route: ProbeRoute, token: string): Promise<QuotaSnapshot> {
  const probe = route.probe;
  const now = new Date().toISOString();
  const displayName = route.displayName;
  const headers: Record<string, string> = { ...(route.headers ?? {}), ...(probe.headers ?? {}) };

  // Set auth header based on authStyle; credential-less routes (local) skip auth entirely
  const authStyle = probe.authStyle ?? "bearer";
  if (token === "") {
    // no auth
  } else if (authStyle === "bearer") {
    headers["Authorization"] = `Bearer ${token}`;
    // Anthropic refuses any request without a version, whichever credential
    // style it carries. Only the x-api-key branch used to set it, so the
    // subscription route probed with a bearer token got a 400 and reported an
    // unknown status for a credential that works perfectly.
    if (isAnthropic(probe.url)) headers["anthropic-version"] ??= "2023-06-01";
  } else if (authStyle === "x-api-key") {
    headers["x-api-key"] = token;
    headers["anthropic-version"] = "2023-06-01";
  }

  let probeURL = probe.url;
  if (authStyle === "query") {
    const url = new URL(probeURL);
    url.searchParams.set("key", token);
    probeURL = url.toString();
  }

  const init: RequestInit = {
    method: probe.method ?? "GET",
    headers,
    // A probe without a deadline is worse than no probe: an endpoint that
    // never answers leaves the provider with no snapshot at all, so its light
    // silently disappears instead of turning red.
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  };
  if (probe.body !== undefined) {
    init.body = probe.body;
    if (headers["content-type"] === undefined) headers["content-type"] = "application/json";
  }

  try {
    const res = await fetch(probeURL, init);
    const status = res.status;

    // Anthropic's messages endpoint reports the 5-hour usage window under its
    // own header family instead of the generic `x-ratelimit-*` names; a
    // probe against it must read those to surface a nearing-limit state
    // rather than only ever seeing "healthy" until the token is rejected.
    const remaining =
      parseRateLimitHeaderNumber(res, "x-ratelimit-remaining") ??
      parseRateLimitHeaderNumber(res, "anthropic-ratelimit-tokens-remaining") ??
      parseRateLimitHeaderNumber(res, "anthropic-ratelimit-requests-remaining");
    const limit =
      parseRateLimitHeaderNumber(res, "x-ratelimit-limit") ??
      parseRateLimitHeaderNumber(res, "anthropic-ratelimit-tokens-limit") ??
      parseRateLimitHeaderNumber(res, "anthropic-ratelimit-requests-limit");
    const resetsAt = parseRateLimitReset(res) ?? parseAnthropicReset(res);

    if (status === 200) {
      return {
        provider: route.id,
        displayName,
        status: "available",
        fetchedAt: now,
        source: "endpoint",
        message: `${route.displayName} healthy`,
        ...rateLimitFields(remaining, limit, resetsAt),
      };
    }

    if (status === 429) {
      return {
        provider: route.id,
        displayName,
        status: "error",
        fetchedAt: now,
        source: "endpoint",
        message: `Rate limited${resetsAt !== undefined ? ` — resets ${new Date(resetsAt).toLocaleTimeString()}` : ""}`,
        ...rateLimitFields(remaining, limit, resetsAt),
      };
    }

    if (status === 403) {
      return {
        provider: route.id,
        displayName,
        status: "error",
        fetchedAt: now,
        source: "endpoint",
        message: "Quota exhausted or access denied",
      };
    }

    if (status === 401) {
      // Some providers answer a funding problem as unauthenticated (Zen returns
      // 401 CreditsError), so read the body before blaming the credential.
      const body = await res.text().catch(() => "");
      if (/credits?[\s_-]*error|payment method|billing/i.test(body)) {
        return {
          provider: route.id,
          displayName,
          status: "error",
          fetchedAt: now,
          source: "endpoint",
          message: "Billing required — the credential works but the account is unfunded",
        };
      }
      return {
        provider: route.id,
        displayName,
        status: "error",
        fetchedAt: now,
        source: "endpoint",
        message: "Auth failed — token may be expired",
      };
    }

    return {
      provider: route.id,
      displayName,
      status: "unknown",
      fetchedAt: now,
      source: "endpoint",
      message: `HTTP ${status}`,
    };
  } catch (err) {
    return {
      provider: route.id,
      displayName,
      status: "error",
      fetchedAt: now,
      source: "endpoint",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Read Anthropic's own reset-timestamp header (`anthropic-ratelimit-tokens-reset`), an ISO string. */
function parseAnthropicReset(res: Response): string | undefined {
  const reset =
    res.headers.get("anthropic-ratelimit-tokens-reset") ??
    res.headers.get("anthropic-ratelimit-requests-reset");
  if (!reset) return undefined;
  const parsed = new Date(reset);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/* -------------------------------------------------------------------------- */
/* Factory: create all built-in providers                                     */
/* -------------------------------------------------------------------------- */

/**
 * Create one quota provider per probeable provider route currently in
 * `routes`. `read` resolves a credential reference to its token (the account
 * seam with env fallback in the wired plugin); tests pass a stub. Called
 * again whenever the registry gains routes, so a provider extension that
 * registers after the initial call still gets probed.
 */
export function createBuiltinProviders(
  read: ProbeTokenReader,
  routes: readonly ProviderRoute[],
): QuotaProvider[] {
  return probeRoutes(routes).map((route) => {
    const tokenRef = probeTokenRef(route);
    return {
      id: route.id,
      /**
       * Reads the credential reference to its token, resolving to a `QuotaSnapshot`.
       * Guarantees a `QuotaSnapshot` with the provider ID, status, and fetched timestamp.
       * Fails if the operation is aborted, returning a snapshot with unknown status.
       */
      async read(signal: { readonly aborted: boolean }): Promise<QuotaSnapshot> {
        if (signal.aborted) {
          return {
            provider: route.id,
            displayName: route.displayName,
            status: "unknown",
            fetchedAt: new Date().toISOString(),
            source: "endpoint",
            message: "Refresh aborted",
          };
        }
        if (tokenRef === undefined) {
          // Credential-less route (local): probe the endpoint without auth.
          return probeEndpoint(route, "");
        }
        const token = await read(tokenRef);
        if (token === undefined || token.length === 0) {
          return {
            provider: route.id,
            displayName: route.displayName,
            status: "unknown",
            fetchedAt: new Date().toISOString(),
            source: "endpoint",
            message: `No ${route.kind === "subscription" ? "token" : "API key"} configured (${tokenRef})`,
          };
        }
        return probeEndpoint(route, token);
      },
    };
  });
}
