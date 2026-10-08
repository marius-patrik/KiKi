/**
 * `DialectAdapter`: a transport-only adapter that serves every dsh provider
 * route through the wire dialect its route declares. Connection facts arrive
 * through a per-provider thunk resolved once per operation, credentials
 * through a per-request resolver, so the registering plugin owns validation,
 * layering, and credential policy. The provider id carried by the harness
 * request selects the route; the model name is passed through to the wire.
 * @module providers/adapter
 */

import {
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  ReasoningEffortId,
  QUOTA_EXCEEDED_CODE,
} from "@deepseek-ai/dsh-llm";
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from "@deepseek-ai/dsh-llm";
import type { AnonymousUserId } from "@deepseek-ai/dsh-anonymous-user-id";
import { idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import type { Dialect, DialectAuth, DialectId } from "@dsh-stack/dialects";
import type { ProviderCatalogModel } from "./providers.js";
import { ModelCatalog, type CatalogSource } from "./catalog.js";

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;

const STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";

/**
 * Validated connection facts for one provider route, resolved per operation
 * by the registering plugin.
 */
export interface ProviderConnection {
  /** Human name for selectors and diagnostics. */
  displayName: string;
  /** Wire dialect this route speaks. */
  dialectId: DialectId;
  /** Endpoint; `{model}` is substituted with the request model when present. */
  baseURL: string;
  /** Fixed headers merged into every request of this route. */
  headers?: Record<string, string>;
  /** Credential slots resolved per request. */
  authSlots: readonly ProviderRouteAuthSlot[];
  /** Advisory models exposed to discovery consumers. */
  models: readonly ProviderCatalogModel[];
  /** Default per-request output cap. */
  defaultMaxTokens: number;
  /** Default context capacity used for uncatalogued models. */
  defaultContextWindow: number;
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number;
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy;
  /** Live model-listing endpoint; absent routes advertise `models` as-is. */
  catalog?: CatalogSource;
}

/** The credential slots a connection needs, decoupled from the static routes. */
export interface ProviderRouteAuthSlot {
  slot: "apiKey" | "token" | "cookie" | "header";
  cookieName?: string;
  headerName?: string;
  ref: string;
}

/** Why a provider is currently unusable, and how discovery should present it. */
export interface ProviderGate {
  /** The reason the provider cannot serve right now. */
  reason: LlmError;
  /**
   * Whether discovery surfaces `reason` as an explained failure row (true) or
   * hides the provider from the selector entirely (false). Billable routes
   * disabled by the filter are hidden; a subscription that is not logged in
   * is shown with its missing-credential reason.
   */
  visible: boolean;
}

/** Constructor options for {@link DialectAdapter}: the operation-local resolution hooks the plugin owns. */
export interface DialectAdapterOptions {
  /** Look up a wire dialect by id; returns the live registered instance. */
  getDialect: (id: DialectId) => Dialect;
  /** Current validated connection facts for one provider; called once per operation. */
  options: (provider: string) => ProviderConnection;
  /**
   * Resolve the credential material for one request from the given snapshot.
   * The snapshot is passed in — never re-read — so credentials can only ever
   * come from the same resolution as the endpoint they are sent to.
   */
  resolveAuth: (provider: string, connection: ProviderConnection) => Promise<DialectAuth>;
  /**
   * Whether one provider may be offered under the current filter mode.
   * `undefined` means the provider is offered as-is; otherwise the gate's
   * reason blocks catalog, selection, and dispatch together so no surface
   * can bypass the filter.
   */
  gate: (provider: string, connection: ProviderConnection) => Promise<ProviderGate | undefined>;
  /** Resolve the harness-home anonymous id shared with telemetry and feedback. */
  resolveUserId: () => AnonymousUserId;
  /**
   * Discovered model listings, shared across operations. Omitted in tests and
   * for hosts that want the static tables only.
   */
  catalog?: ModelCatalog;
  /**
   * Other registered provider ids that are additional accounts for the same
   * vendor as `provider` (e.g. `openrouter` -> `["openrouter-2",
   * "openrouter-3"]`), in the order they should be tried. Excludes `provider`
   * itself. Omitted or empty means no same-vendor failover is possible for
   * that provider (see {@link DialectAdapter.stream}, #187).
   */
  rotationSiblings?: (provider: string) => readonly string[];
  /** Called once a rate-limited or quota-exhausted request is about to retry against a same-vendor sibling account. */
  onRotate?: (fromProvider: string, toProvider: string, code: string) => void;
}

/** {@link httpErrorCode} results that a same-vendor sibling account can plausibly avoid. */
const ROTATABLE_CODES: ReadonlySet<string> = new Set([QUOTA_EXCEEDED_CODE, "RATE_LIMIT"]);

/** One model entry advertised by {@link DialectAdapter}. */
export interface ProviderModel extends ProviderCatalogModel {}

/** modelInfo implementation. */
function modelInfo(provider: string, model: ProviderModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    inputModalities: ["text"],
  };
}

/**
 * Provider error text that carries no information. Anthropic answers a
 * subscription rate limit with `{"type":"rate_limit_error","message":"Error"}`,
 * and the client renders that message verbatim — so the user is told
 * "Failure reason: Error" about a plan limit they could simply wait out or
 * switch models to avoid.
 */
const UNINFORMATIVE_MESSAGE =
  /^(?:error|errors?occurred|unknown(?:\s+error)?|failed|failure|bad\s+request)?[.!]?$/i;

/**
 * A message worth showing for a status the provider did not explain.
 * @param status - the HTTP status of the failed response.
 * @param provider - the route the request was dispatched to.
 * @param retryAfterMs - the provider's retry hint, when it sent one.
 * @returns human-readable text naming the provider and what the status means.
 */
export function describeHttpFailure(
  status: number,
  provider: string,
  retryAfterMs: number | undefined,
): string {
  const retry =
    retryAfterMs === undefined
      ? ""
      : ` Retry in about ${Math.max(1, Math.round(retryAfterMs / 1000))}s.`;
  if (status === 429) {
    return (
      `${provider}: rate limited by the provider (HTTP 429) — the plan's limit for this` +
      ` model is reached. Another model on this provider may still serve.${retry}`
    );
  }
  if (status === 401 || status === 403) {
    return `${provider}: the provider refused this credential (HTTP ${status}).`;
  }
  if (status >= 500) {
    return `${provider}: the provider reported an internal error (HTTP ${status}).${retry}`;
  }
  return `${provider}: request failed (HTTP ${status}).${retry}`;
}

/** Tolerant parse of a non-2xx provider body; never throws. */
function parseErrorBody(text: string): { message?: string; detail?: string } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string") return { message: record.error };
      if (typeof record.error === "object" && record.error !== null) {
        const error = record.error as Record<string, unknown>;
        const message = typeof error.message === "string" ? error.message : undefined;
        const detail = [error.code, error.type, error.message]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join(" ");
        return {
          ...(message === undefined ? {} : { message }),
          ...(detail.length > 0 ? { detail } : {}),
        };
      }
      if (typeof record.message === "string")
        return { message: record.message, detail: record.message };
    }
  } catch {
    // Not JSON; the HTTP status still identifies the failure.
  }
  return {};
}

/**
 * Returns the retry delay in milliseconds after which the request should be retried.
 *
 * @param value - A string representing the retry delay or a date string.
 * @returns The retry delay in milliseconds or undefined if invalid.
 * @returns undefined if the input is null or invalid.
 */
function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000;
    return Number.isFinite(delay) && delay > 0 ? delay : undefined;
  }
  const delay = Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0 ? delay : undefined;
}

/**
 * Retrieves the request ID from the provided HTTP headers.
 *
 * @param headers - The HTTP headers containing potential request IDs.
 * @returns The request ID as a string, or undefined if not found.
 */
function requestId(headers: Headers): ReturnType<typeof ProviderRequestId> | undefined {
  for (const name of [
    "x-request-id",
    "x-deepseek-request-id",
    "anthropic-request-id",
    "x-ai-request-id",
    "request-id",
  ]) {
    const value = headers.get(name);
    if (value !== null && value.length > 0) return ProviderRequestId(value);
  }
  return undefined;
}

/**
 * Terminal quota wordings the harness classifier does not recognize. Kimi
 * answers an exhausted coding plan with 403 `access_terminated_error` and
 * "You've reached your usage limit for this billing cycle" — verb-first
 * phrasing the harness `usage limit reached` pattern cannot match.
 */
const PROVIDER_QUOTA_WORDINGS: readonly RegExp[] = [
  /\baccess[\s_-]+terminated[\s_-]+error\b/i,
  /\breach(?:ed|es)?\b.{0,24}\busage[\s_-]+limit\b/i,
  /\busage[\s_-]+limit\b.{0,32}\bbilling[\s_-]+cycle\b/i,
  // OpenCode Zen answers an unfunded workspace with 401 CreditsError,
  // "No payment method. Add a payment method here: <billing url>".
  /\bcredits?[\s_-]*error\b/i,
  /\bno[\s_-]+payment[\s_-]+method\b/i,
  /\badd[\s_-]+a[\s_-]+payment[\s_-]+method\b/i,
];

/** Whether a provider detail identifies an exhausted plan rather than a bad credential. */
function isExhaustedQuota(detail: string | undefined): boolean {
  if (detail === undefined) return false;
  return (
    isQuotaExceededError(detail) || PROVIDER_QUOTA_WORDINGS.some((pattern) => pattern.test(detail))
  );
}

/**
 * Map an HTTP status to a stable harness LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param detail - provider error detail text, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, detail: string | undefined): string {
  // A refusal that carries terminal quota or billing wording is an exhausted
  // plan, not a bad credential. It must be classified before the auth mapping,
  // or the client renders the AUTH code as "API key is invalid" and sends the
  // operator off re-authenticating a credential that was never the problem.
  //
  // This covers 401 as well as 403: providers do answer a funding problem as
  // unauthenticated — Zen returns 401 CreditsError for a workspace with no
  // payment method, about a key that authenticates perfectly.
  if ((status === 401 || status === 403) && isExhaustedQuota(detail)) return QUOTA_EXCEEDED_CODE;
  if (status === 401 || status === 403) return "AUTH";
  if (isExhaustedQuota(detail)) return QUOTA_EXCEEDED_CODE;
  // 402 Payment Required is unambiguous by HTTP semantics alone -- unlike 401/403
  // it needs no wording match, since providers use it exclusively for credit/balance
  // exhaustion (OpenRouter: "requires more credits", "Prompt tokens limit exceeded",
  // "would exceed your available credits"), never for a bad credential.
  if (status === 402) return QUOTA_EXCEEDED_CODE;
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) {
    if (detail !== undefined && isContextWindowExceededError(detail))
      return CONTEXT_WINDOW_EXCEEDED_CODE;
    return "INVALID_REQUEST";
  }
  if (status >= 500) return "SERVER";
  return `HTTP_${status}`;
}

/**
 * The generic provider adapter. One instance serves every registered route:
 * the harness model name IS the wire model name, and the request provider id
 * selects the route facts for the operation.
 */
export class DialectAdapter extends LlmAdapter {
  /** Constructs an instance. */
  constructor(private readonly config: DialectAdapterOptions) {
    super();
  }

  /** providerInfo implementation. */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.config.options(provider).displayName };
  }

  /** providerRetryPolicy implementation. */
  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options(_provider).retryPolicy;
  }

  /**
   * The models one provider offers: its live listing merged over the static
   * table when the route publishes one, the static table otherwise.
   *
   * Discovery needs the route's credential, and an unauthenticated route must
   * still be able to show what it *would* offer, so a failure to resolve auth
   * is treated exactly like a failed listing — fall back, never throw. The
   * credential gate is enforced by `gate` and `stream`, not here.
   * @param provider - the provider id.
   * @param connection - the connection facts resolved for this operation.
   * @returns the catalog to advertise.
   */
  async #catalog(
    provider: string,
    connection: ProviderConnection,
  ): Promise<readonly ProviderCatalogModel[]> {
    const catalog = this.config.catalog;
    const source = connection.catalog;
    if (catalog === undefined || source === undefined) return connection.models;
    let auth: DialectAuth;
    try {
      auth = await this.config.resolveAuth(provider, connection);
    } catch {
      return connection.models;
    }
    const token = auth.token ?? auth.apiKey;
    if (token === undefined || token.length === 0) return connection.models;
    return catalog.models(provider, {
      source,
      ...(connection.headers === undefined ? {} : { headers: connection.headers }),
      token,
      fallback: connection.models,
      defaults: {
        contextWindow: connection.defaultContextWindow,
        maxTokens: connection.defaultMaxTokens,
      },
    });
  }

  /**
   * Returns a list of visible models for the given provider.
   *
   * @param provider - The provider for which to list models.
   * @returns A promise that resolves to an array of model information objects.
   * @throws Throws an error if the gate is not visible.
   */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const connection = this.config.options(provider);
    const gate = await this.config.gate(provider, connection);
    if (gate !== undefined) {
      if (!gate.visible) return [];
      throw gate.reason;
    }
    const models = await this.#catalog(provider, connection);
    return models.map((model) => modelInfo(provider, model));
  }

  /**
   * Resolves a model for the given provider and model name.
   *
   * @param provider - The provider for which to resolve the model.
   * @param model - The name of the model to resolve.
   * @param _signal - Optional signal to abort the operation.
   * @returns A promise that resolves to the resolved model information.
   * @throws Throws an error if the model is not visible or if the gate is not visible.
   */
  override async resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options(provider);
    const gate = await this.config.gate(provider, connection);
    if (gate !== undefined) throw gate.reason;
    const models = await this.#catalog(provider, connection);
    const configured = models.find((entry) => entry.id === model);
    const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow;
    return Promise.resolve({
      ...(configured === undefined
        ? { provider, id: model, name: model, inputModalities: ["text" as const] }
        : modelInfo(provider, configured)),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.defaultMaxTokens,
      // The harness carries this straight to the model picker, so a model that
      // declares efforts becomes one the user can pick an effort for.
      ...(configured?.reasoning === undefined
        ? {}
        : {
            reasoning: {
              efforts: configured.reasoning.efforts.map((effort) => ({
                id: ReasoningEffortId(effort.id),
                name: effort.name,
                ...(effort.description === undefined ? {} : { description: effort.description }),
              })),
              ...(configured.reasoning.defaultEffort === undefined
                ? {}
                : { defaultEffort: ReasoningEffortId(configured.reasoning.defaultEffort) }),
            },
          }),
    });
  }

  /** stream implementation. */
  /**
   * Runs one request attempt against `provider` from start to finish. Same
   * behavior `stream` had before same-vendor rotation (#187): one connection
   * resolution per call, idle watchdog, and the timeout/abort/transport error
   * normalization every attempt needs regardless of which candidate it is.
   */
  async *#streamOneProvider(
    provider: string,
    options: GenerateOptions,
  ): AsyncIterable<StreamChunk> {
    // One resolution per attempt: connection facts and credentials freeze
    // here for this whole request, so an in-flight stream never observes a
    // configuration change and the next call re-resolves.
    const connection = this.config.options(provider);
    const gate = await this.config.gate(provider, connection);
    if (gate !== undefined) throw gate.reason;
    const auth = await this.config.resolveAuth(provider, connection);
    const dialect = this.config.getDialect(connection.dialectId);
    const userId = this.config.resolveUserId();
    const consumer = new AbortController();
    const upstream =
      options.signal === undefined
        ? consumer.signal
        : AbortSignal.any([options.signal, consumer.signal]);
    using watchdog = idleWatchdog(
      upstream,
      connection.streamIdleTimeoutMs,
      STREAM_IDLE_TIMEOUT_CODE,
    );
    const iterator = this.request(
      { ...options, provider },
      watchdog.signal,
      connection,
      auth,
      dialect,
      userId,
      () => {
        watchdog.pulse();
      },
    )[Symbol.asyncIterator]();
    let exhausted = false;
    try {
      while (true) {
        const result = await watchdog.next(iterator);
        if (result.done) {
          exhausted = true;
          return;
        }
        yield result.value;
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `Provider stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          "TIMEOUT",
          { cause: error },
        );
      }
      if (options.signal?.aborted) {
        throw new LlmError("Provider request aborted by caller", "ABORTED", { cause: error });
      }
      if (error instanceof LlmError) throw error;
      throw new LlmError(`Provider API stream from ${connection.baseURL} failed`, "TRANSPORT", {
        cause: error,
      });
    } finally {
      consumer.abort("Provider stream consumer stopped");
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return();
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination.
        }
      }
    }
  }

  /**
   * Streams a request against `options.provider`, failing over to same-vendor
   * sibling accounts (#187) on a rate-limit or quota/balance-exhaustion error
   * that struck before any chunk reached the caller. A failure after partial
   * output never rotates: the caller already has content attributed to the
   * first provider, and a fresh attempt from a sibling would answer the same
   * prompt twice.
   */
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const candidates = [
      options.provider,
      ...(this.config.rotationSiblings?.(options.provider) ?? []),
    ];
    for (let index = 0; index < candidates.length; index++) {
      const provider = candidates[index]!;
      const iterator = this.#streamOneProvider(provider, options)[Symbol.asyncIterator]();
      let yieldedAny = false;
      try {
        while (true) {
          const result = await iterator.next();
          if (result.done) return;
          yieldedAny = true;
          yield result.value;
        }
      } catch (error: unknown) {
        const nextProvider = candidates[index + 1];
        if (
          yieldedAny ||
          nextProvider === undefined ||
          !(error instanceof LlmError) ||
          !ROTATABLE_CODES.has(error.code)
        ) {
          throw error;
        }
        this.config.onRotate?.(provider, nextProvider, error.code);
      }
    }
  }

  /**
   * Handles streaming requests from a watchdog iterator until completion or error.
   *
   * Guarantees to yield values from the iterator until done is true, then returns.
   * On timeout or caller abortion, throws an LlmError with appropriate status.
   * On unhandled error, throws an LlmError indicating transport failure.
   */
  private async *request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: ProviderConnection,
    auth: DialectAuth,
    dialect: Dialect,
    userId: AnonymousUserId,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const baseURL = connection.baseURL.includes("{model}")
      ? connection.baseURL.replace("{model}", encodeURIComponent(options.model))
      : connection.baseURL;
    // The route default is a fallback for models the catalog does not size, not
    // a value to impose on one it does: claude-sub defaults to 128k output
    // while Haiku caps at 64k, and sending the route default is rejected
    // outright. Prefer the catalog entry for the model actually requested.
    const catalogued = (await this.#catalog(options.provider, connection)).find(
      (entry) => entry.id === options.model,
    );
    const request = dialect.serialize(options, auth, baseURL, {
      maxTokens: catalogued?.maxTokens ?? connection.defaultMaxTokens,
    });
    const payload = request.body;
    const headers = {
      ...request.headers,
      ...attributionHeaders(),
      "x-deepseek-harness-user-id": String(userId),
      ...(options.sessionId !== undefined
        ? { "x-deepseek-harness-session-id": String(options.sessionId) }
        : {}),
      ...(options.purpose === "compaction" ? { "x-deepseek-harness-compact": "1" } : {}),
    };

    let response: Response;
    try {
      response = await fetch(request.url, {
        method: "POST",
        headers,
        body: payload,
        signal,
      });
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      throw new LlmError(`Provider API request to ${baseURL} failed`, "TRANSPORT", {
        cause: error,
      });
    }

    if (!response.ok) {
      const body = await response.text();
      const parsed = parseErrorBody(body);
      const delay = providerRetryAfterMs(response.headers.get("retry-after"));
      // Prefer the provider's own words, but only when they say something. A
      // placeholder message reaches the user as the entire failure reason.
      const message =
        parsed.message !== undefined && !UNINFORMATIVE_MESSAGE.test(parsed.message.trim())
          ? parsed.message
          : describeHttpFailure(response.status, options.provider, delay);
      const id = requestId(response.headers);
      throw new LlmError(message, httpErrorCode(response.status, parsed.detail), {
        status: response.status,
        ...(delay === undefined ? {} : { providerRetryAfterMs: delay }),
        ...(id === undefined ? {} : { requestId: id }),
      });
    }
    if (!response.body) {
      throw new LlmError("Provider API returned no response body", "EMPTY_RESPONSE");
    }

    yield* dialect.parse(response.body, onComment);
  }
}
