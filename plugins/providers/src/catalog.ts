/**
 * Live model discovery: fetch a route's model list from the provider instead
 * of trusting a hand-maintained table. Every route that publishes a listing
 * endpoint declares it as `catalog`; the adapter asks this module for the
 * models it offers, and the static `models` table in `providers.ts` becomes a
 * fallback rather than the source of truth.
 *
 * Two properties keep this safe to put in front of the selector:
 *
 * - **Union, not replacement.** Discovered ids come first, then any static
 *   entry the endpoint did not list. Providers routinely accept wire aliases
 *   they omit from `/models` (Kimi serves `kimi-k3` while listing it as `k3`),
 *   so dropping the static rows would break working model ids the moment
 *   discovery came online.
 * - **Failure is never fatal.** A refused, unreachable, or unparsable listing
 *   returns the static table. Discovery can only ever add to what already
 *   worked.
 *
 * @module providers/catalog
 */

import type { ProbeAuthStyle, ProviderCatalogModel } from "./providers.js";

/** Where a route's model listing lives, and how the request authenticates. */
export interface CatalogSource {
  /** The model-listing endpoint. */
  url: string;
  /** How the credential is sent; defaults to `Authorization: Bearer`. */
  authStyle?: ProbeAuthStyle;
}

/** One model as the provider reported it; unpublished facts stay undefined. */
export interface DiscoveredModel {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
}

/** Default time a discovered listing is reused before refetching. */
export const DEFAULT_CATALOG_TTL_MS = 3_600_000;

/** How long a model listing may wait before discovery gives up for this TTL. */
const CATALOG_TIMEOUT_MS = 15_000;

/** How long a failed discovery is remembered, so a broken endpoint is not hammered. */
const FAILURE_TTL_MS = 60_000;

/**
 * Parses a catalog entry to extract a discovered model.
 * @param entry - An object representing a catalog entry, typically with an `id`.
 * @returns The discovered model object if the entry contains a valid `id`, otherwise undefined.
 */
function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Extracts a non-empty string from a given value.
 * @param value - The value to check.
 * @returns The non-empty string if the value is a string and not empty, otherwise undefined.
 */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Read one entry of a model listing. OpenAI-, Anthropic- and OpenRouter-shaped
 * responses all nest their rows under `data` with an `id`; they disagree only
 * on where the display name and the window size live, so every known spelling
 * is accepted and anything missing is left undefined for the merge to fill.
 * @param entry - one element of the listing's `data` array.
 * @returns the discovered model, or undefined when the row carries no usable id.
 */
export function parseCatalogEntry(entry: unknown): DiscoveredModel | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const row = entry as Record<string, unknown>;
  const id = nonEmptyString(row.id);
  if (id === undefined) return undefined;

  const name = nonEmptyString(row.display_name) ?? nonEmptyString(row.name);
  // `top_provider` is OpenRouter's per-upstream capability block.
  const topProvider =
    typeof row.top_provider === "object" && row.top_provider !== null
      ? (row.top_provider as Record<string, unknown>)
      : undefined;
  const contextWindow =
    positiveInteger(row.context_length) ??
    positiveInteger(row.context_window) ??
    positiveInteger(row.max_context_length) ??
    // Anthropic's spelling for the input window.
    positiveInteger(row.max_input_tokens) ??
    positiveInteger(topProvider?.context_length);
  const maxTokens =
    positiveInteger(row.max_output_tokens) ??
    positiveInteger(row.max_completion_tokens) ??
    // Anthropic publishes the output cap as plain `max_tokens`.
    positiveInteger(row.max_tokens) ??
    positiveInteger(topProvider?.max_completion_tokens);

  return {
    id,
    ...(name === undefined ? {} : { name }),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
  };
}

/**
 * Parse a model-listing response body.
 * @param payload - the decoded JSON body.
 * @returns the discovered models, or undefined when the body is not a listing.
 */
export function parseCatalogResponse(payload: unknown): DiscoveredModel[] | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const rows = (payload as { data?: unknown }).data ?? (payload as { models?: unknown }).models;
  if (!Array.isArray(rows)) return undefined;
  const models = rows
    .map(parseCatalogEntry)
    .filter((model): model is DiscoveredModel => model !== undefined);
  return models.length > 0 ? models : undefined;
}

/**
 * Combine a discovered listing with the static table.
 *
 * Discovered models come first and win on every fact the provider published;
 * facts it did not publish fall back to the static row of the same id, then to
 * the route defaults. Static rows the listing omitted are appended, so wire
 * aliases that were working before discovery keep working after it.
 * @param discovered - models the provider reported.
 * @param fallback - the route's static model table.
 * @param defaults - route-level context and output defaults.
 * @returns the merged catalog, discovered entries first.
 */
export function mergeCatalog(
  discovered: readonly DiscoveredModel[],
  fallback: readonly ProviderCatalogModel[],
  defaults: { contextWindow: number; maxTokens: number },
): ProviderCatalogModel[] {
  const staticById = new Map(fallback.map((model) => [model.id, model]));
  const merged: ProviderCatalogModel[] = discovered.map((model) => {
    const known = staticById.get(model.id);
    return {
      id: model.id,
      name: model.name ?? known?.name ?? model.id,
      contextWindow: model.contextWindow ?? known?.contextWindow ?? defaults.contextWindow,
      maxTokens: model.maxTokens ?? known?.maxTokens ?? defaults.maxTokens,
      // Listings do not publish reasoning levels, so the static row is the only
      // source; dropping it here would silently remove the effort changer from
      // every model the moment discovery came online.
      ...(known?.reasoning === undefined ? {} : { reasoning: known.reasoning }),
    };
  });
  const discoveredIds = new Set(merged.map((model) => model.id));
  for (const model of fallback) {
    if (!discoveredIds.has(model.id)) merged.push(model);
  }
  return merged;
}

/** What one route needs to fetch its listing. */
export interface CatalogRequest {
  source: CatalogSource;
  /** Fixed headers the route sends on every request. */
  headers?: Record<string, string>;
  /** The credential material, already resolved for this route. */
  token: string;
  /** The route's static table, returned whenever discovery cannot answer. */
  fallback: readonly ProviderCatalogModel[];
  defaults: { contextWindow: number; maxTokens: number };
}

/**
 * Build the listing request for one route: the same auth styles the quota
 * probes use, so a route describes how it authenticates exactly once.
 * @param request - the route's catalog request facts.
 * @returns the URL and init to fetch with.
 */
export function catalogRequestInit(request: CatalogRequest): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { ...request.headers, accept: "application/json" };
  const authStyle: ProbeAuthStyle = request.source.authStyle ?? "bearer";
  let url = request.source.url;
  if (authStyle === "bearer") {
    headers["authorization"] = `Bearer ${request.token}`;
    // Same rule as the probes: Anthropic needs a version on every request, so
    // a bearer-authenticated listing 400s without it and discovery silently
    // falls back to the static table.
    if (isAnthropicHost(url)) headers["anthropic-version"] ??= "2023-06-01";
  } else if (authStyle === "x-api-key") {
    headers["x-api-key"] = request.token;
    headers["anthropic-version"] ??= "2023-06-01";
  } else {
    const parsed = new URL(url);
    parsed.searchParams.set("key", request.token);
    url = parsed.toString();
  }
  return {
    url,
    // Bounded: a stalled listing must fall back to the static table on a
    // deadline rather than holding the model selector open.
    init: { method: "GET", headers, signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) },
  };
}

/** Whether an endpoint is Anthropic's, which requires a version header. */
function isAnthropicHost(url: string): boolean {
  try {
    return new URL(url).hostname === "api.anthropic.com";
  } catch {
    return false;
  }
}

type CacheEntry = { models: readonly ProviderCatalogModel[]; expiresAt: number };

/**
 * Per-provider discovered catalogs with a TTL, a negative cache, and in-flight
 * coalescing so a burst of selector reads makes one request.
 */
export class ModelCatalog {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<readonly ProviderCatalogModel[]>>();
  readonly #ttlMs: number;
  readonly #fetch: typeof fetch;

  /** Constructs an instance. */
  constructor(options: { ttlMs?: number; fetch?: typeof fetch } = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_CATALOG_TTL_MS;
    this.#fetch = options.fetch ?? fetch;
  }

  /** Drop every cached listing, so the next read refetches. */
  clear(): void {
    this.#entries.clear();
  }

  /**
   * The models one provider offers: the discovered listing merged over the
   * static table, or the static table alone when discovery cannot answer.
   * @param provider - the provider id, used as the cache key.
   * @param request - how to fetch and what to fall back to.
   * @returns the catalog to advertise.
   */
  async models(
    provider: string,
    request: CatalogRequest,
  ): Promise<readonly ProviderCatalogModel[]> {
    const cached = this.#entries.get(provider);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.models;

    const inflight = this.#inflight.get(provider);
    if (inflight !== undefined) return inflight;

    const run = this.#discover(request)
      .then((models) => {
        this.#entries.set(provider, { models, expiresAt: Date.now() + this.#ttlMs });
        return models;
      })
      .catch(() => {
        // Discovery is an enhancement: remember the failure briefly so a dead
        // endpoint costs one request per minute, and serve the static table.
        this.#entries.set(provider, {
          models: request.fallback,
          expiresAt: Date.now() + FAILURE_TTL_MS,
        });
        return request.fallback;
      })
      .finally(() => {
        this.#inflight.delete(provider);
      });

    this.#inflight.set(provider, run);
    return run;
  }

  /** #discover implementation. */
  async #discover(request: CatalogRequest): Promise<readonly ProviderCatalogModel[]> {
    const { url, init } = catalogRequestInit(request);
    const response = await this.#fetch(url, init);
    if (!response.ok) throw new Error(`model listing failed (HTTP ${response.status})`);
    const discovered = parseCatalogResponse(await response.json());
    if (discovered === undefined) throw new Error("model listing carried no recognizable rows");
    return mergeCatalog(discovered, request.fallback, request.defaults);
  }
}
