/**
 * `providers`: twenty provider adapters (kimi-code, kimi-sub,
 * claude-sub, grok-sub, gemini-sub, antigravity-sub, openai-api, anthropic-api,
 * gemini-api, grok-api, deepseek-api, mistral-api, groq-api, openrouter-api,
 * cerebras-api, zai-api, zen, ollama, llamacpp, vllm) wired onto dialects.
 * The quotas subpackage provides quota probing and the `/quotas/api/*` web
 * routes — merged from the standalone dsh-quotas plugin to eliminate data
 * duplication. Connection facts resolve per request from this entry's own
 * Config, and credential material resolves per request through the account seam
 * (`ctx.accounts`) with the harness credential seam as fallback, so a changed
 * base URL or secret reaches the very next request without restarting anything.
 *
 * Since 0.2.0 no settings form is registered: the settings service projects the
 * volatile Config fields of the active profile's entries, so this plugin's own
 * `Config` *is* its form and its namespace is this entry's own id. What remains
 * to declare is that this plugin ships its own page — `client.js` builds the
 * whole Providers UI (accounts, model catalog, OAuth flows, quota widgets)
 * against its own `/vault/api` and `/quotas/api` routes, and writes no
 * Config field at all — so `declareCustomSettingsPage` turns off the service's
 * generated schema page rather than letting it render over fields the page does
 * not use.
 * @module providers
 */

import type { Context, Volatile } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { LlmError, resolveRetryPolicy, RetryPolicySchema } from "@deepseek-ai/dsh-llm";
import type { RetryPolicyConfig } from "@deepseek-ai/dsh-llm";
import { credentialRef, type CredentialProvider } from "@deepseek-ai/dsh-credentials";
import { declareCustomSettingsPage, settingsNamespace } from "@dsh-stack/plugin-kit";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import type { AccountsService } from "@dsh-stack/credential-vault";
import {
  getOrCreateAnonymousUserId,
  type AnonymousUserId,
} from "@deepseek-ai/dsh-anonymous-user-id";
import { DialectAdapter, DEFAULT_STREAM_IDLE_TIMEOUT_MS } from "./adapter.js";
import { ModelCatalog, DEFAULT_CATALOG_TTL_MS } from "./catalog.js";
import type { ProviderConnection, ProviderGate, ProviderRouteAuthSlot } from "./adapter.js";
import { vendorBaseId, vendorSuffix } from "./providers.js";
import type { ProviderRoute } from "./providers.js";
import { ProviderRegistry } from "./registry.js";
import { applyQuotas } from "./quotas/index.js";
import type { DialectAuth, DialectId } from "@dsh-stack/dialects";

export {
  DialectAdapter,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  httpErrorCode,
  describeHttpFailure,
} from "./adapter.js";
export type { ProviderConnection, ProviderGate, ProviderRouteAuthSlot } from "./adapter.js";
export {
  ModelCatalog,
  DEFAULT_CATALOG_TTL_MS,
  mergeCatalog,
  parseCatalogResponse,
} from "./catalog.js";
export type { CatalogSource, DiscoveredModel } from "./catalog.js";
export { ProviderRegistry } from "./registry.js";
export {
  TOKEN,
  API_KEY,
  HEADER,
  HEADERS,
  EFFORTS,
  CLAUDE_HAIKU_MODEL,
  kimiCoreModels,
  KIMI_CONTEXT,
  KIMI_K3_CONTEXT,
  KIMI_MAX_OUTPUT,
  CLAUDE_CONTEXT,
  CLAUDE_MAX_OUTPUT,
  GEMINI_CONTEXT,
  GEMINI_MAX_OUTPUT,
  OPENAI_MAX_OUTPUT,
  OPENAI_DEFAULT_CONTEXT,
  XAI_CONTEXT,
  XAI_MAX_OUTPUT,
  MISTRAL_CONTEXT,
  MISTRAL_MAX_OUTPUT,
  DEEPSEEK_CONTEXT,
  DEEPSEEK_MAX_OUTPUT,
  GROQ_CONTEXT,
  GROQ_MAX_OUTPUT,
  ZEN_CONTEXT,
  ZEN_MAX_OUTPUT,
  ZEN_CLAUDE_CONTEXT,
  ZEN_CLAUDE_MAX_OUTPUT,
  CEREBRAS_CONTEXT,
  CEREBRAS_MAX_OUTPUT,
  ZAI_CONTEXT,
  ZAI_MAX_OUTPUT,
  vendorBaseId,
  vendorSuffix,
} from "./providers.js";
export type {
  AuthKind,
  CredentialSlot,
  ProviderCatalogModel,
  ProviderKind,
  ProviderProbe,
  ProviderReasoning,
  ProviderReasoningEffort,
  ProviderRoute,
} from "./providers.js";

// Quotas subpackage re-exports (merged from standalone dsh-quotas)
export {
  QuotaRegistry,
  applyQuotas,
  QUOTAS_PREFIX,
  mountQuotaWeb,
} from "./quotas/index.js";
export {
  createConfiguredProviders,
  probeConfiguredRoute,
  readConfiguredProfile,
  modelsEndpoint,
} from "./quotas/index.js";
export type {
  ConfigurableProviderEntry,
  ConfiguredProbeDeps,
  ConfiguredRouteProfile,
  SettingsDescriptorView,
} from "./quotas/index.js";
export type { QuotaSnapshot, QuotaProvider, QuotasConfig } from "./quotas/index.js";

/**
 * Verified OAuth refresh endpoints for the subscription providers. The vault
 * stores, per provider: the access token (`..._OAUTH_TOKEN`), the refresh
 * token (`..._REFRESH_TOKEN`, single-use and rotated for claude/kimi/grok,
 * durable for gemini), and the access expiry as epoch milliseconds
 * (`..._EXPIRES`). Client ids come from the providers' own CLIs; Gemini's
 * client id and secret are themselves kept in the vault (GitHub push
 * protection rejects GCP OAuth material in committed code), resolved through
 * `clientIdRef` / `clientSecretRef`.
 */
type OAuthRefresher = {
  url: string;
  clientId?: string;
  clientIdRef?: string;
  clientSecret?: string;
  clientSecretRef?: string;
  /** Anthropic's endpoint takes a JSON body; the others take form data. */
  json?: boolean;
  tokenRef: string;
  refreshRef: string;
  expiresRef: string;
};

const OAUTH_REFRESHERS: Record<string, OAuthRefresher> = {
  "kimi-sub": {
    url: "https://auth.kimi.com/api/oauth/token",
    clientId: "17e5f671-d194-4dfb-9706-5516cb48c098",
    tokenRef: "KIMI_SUB_OAUTH_TOKEN",
    refreshRef: "KIMI_SUB_REFRESH_TOKEN",
    expiresRef: "KIMI_SUB_EXPIRES",
  },
  "claude-sub": {
    url: "https://api.anthropic.com/v1/oauth/token",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    json: true,
    tokenRef: "CLAUDE_SUB_OAUTH_TOKEN",
    refreshRef: "CLAUDE_SUB_REFRESH_TOKEN",
    expiresRef: "CLAUDE_SUB_EXPIRES",
  },
  "grok-sub": {
    url: "https://auth.x.ai/oauth2/token",
    clientId: "b1a00492-073a-47ea-816f-4c329264a828",
    tokenRef: "GROK_SUB_OAUTH_TOKEN",
    refreshRef: "GROK_SUB_REFRESH_TOKEN",
    expiresRef: "GROK_SUB_EXPIRES",
  },
  "gemini-sub": {
    url: "https://oauth2.googleapis.com/token",
    clientIdRef: "GEMINI_SUB_CLIENT_ID",
    clientSecretRef: "GEMINI_SUB_CLIENT_SECRET",
    tokenRef: "GEMINI_SUB_OAUTH_TOKEN",
    refreshRef: "GEMINI_SUB_REFRESH_TOKEN",
    expiresRef: "GEMINI_SUB_EXPIRES",
  },
};

/** How long an OAuth refresh may wait before it counts as a transient failure. */
const TOKEN_REFRESH_TIMEOUT_MS = 15_000;

type RefreshedToken = { access: string; refresh?: string; expires: number };

/** refreshOAuthToken implementation. */
async function refreshOAuthToken(
  spec: OAuthRefresher & { clientId: string },
  refreshToken: string,
): Promise<RefreshedToken> {
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: spec.clientId,
    ...(spec.clientSecret !== undefined ? { client_secret: spec.clientSecret } : {}),
  };
  const res = await fetch(spec.url, {
    method: "POST",
    headers: {
      "content-type": spec.json === true ? "application/json" : "application/x-www-form-urlencoded",
    },
    body: spec.json === true ? JSON.stringify(params) : new URLSearchParams(params),
    // Bounded so a stalled token endpoint cannot hang every caller waiting on
    // this refresh — the coalescing map means one hung refresh would otherwise
    // stall the provider's next request and its quota probe indefinitely.
    signal: AbortSignal.timeout(TOKEN_REFRESH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `Token refresh failed (HTTP ${res.status}) for ${spec.url}: ${body.slice(0, 200)}`,
    );
    // 400/401/403 on a refresh grant means the refresh token itself is dead
    // (invalid_grant — e.g. a consumed single-use rotating token). Retrying
    // can never succeed; the user must re-authenticate.
    if (res.status === 400 || res.status === 401 || res.status === 403)
      (err as { permanent?: boolean }).permanent = true;
    throw err;
  }
  const data = (await res.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof data.access_token !== "string") {
    throw new Error(`Token refresh response missing access_token for ${spec.url}`);
  }
  const expiresIn =
    typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600;
  return {
    access: data.access_token,
    refresh: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expires: Date.now() + (expiresIn - 120) * 1000,
  };
}

export const name = "providers";
export const inject = ["llm", "dialects"];
// Consumers that contribute or read this instance's routes wait for it too;
// declaring `providers` in `inject` (rather than a bare `ctx.get`) is what
// makes cordis run this plugin's `apply` — which creates `ctx.providers` —
// strictly before any `@dsh-stack/provider-<id>` extension's own `apply`.

/**
 * The settings namespace of the `providers` form — this plugin's own Loader entry
 * id. Since 0.2.0 the namespace is the entry id, so this only re-brands a string
 * the plugin already owns and cannot drift from the form the settings service
 * projects.
 */
export const NS = settingsNamespace("providers");

/**
 * Plugin config, validated by the same-named schemastery schema, and since
 * 0.2.0 also this entry's settings form.
 *
 * Every field is classified by the themes principle: a deployment fact stays
 * plain, a user choice becomes volatile. A plain field is not part of the form,
 * so no settings write may address it and editing it restarts the entry instead
 * of landing under the user's cursor; a volatile field is part of the form, and
 * the Loader commits a write into the same live reference, so every read below
 * goes through `.get()` and the plugin reacts on `loader/volatile-update`.
 */
export interface Config {
  /**
   * Per-provider endpoint overrides keyed by provider id (e.g. `kimi-code`).
   *
   * Volatile: which endpoint a route talks to is the answer to "where is my
   * proxy / my self-hosted gateway", which differs per installation, and this
   * plugin documents that a changed base URL reaches the very next request
   * without a restart. The whole dictionary is volatile rather than each of its
   * entries, because a form write can only address a path lying under a volatile
   * node — a reference per entry could be neither declared nor edited.
   */
  baseURLs: Volatile<Record<string, string>>;
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs?: number;
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig;
  /**
   * Provider filter. `subscription-only` hides pay-as-you-go API routes from
   * the model selector and refuses them at dispatch, so conversation traffic
   * can only ever run on subscription providers; `all` offers every route.
   *
   * Volatile: whether this seat may spend money per token is the account
   * holder's decision, not a property of the installation, and flipping it must
   * not tear down in-flight streams to re-register the adapter.
   */
  mode: Volatile<"subscription-only" | "all">;
  /**
   * Discover each route's models from the provider's own listing endpoint
   * instead of relying on the static table. Defaults to on: a new model
   * release then reaches the selector without a code change. Set false to pin
   * the selector to the shipped tables.
   *
   * Volatile: it is a per-machine preference about whether the selector reaches
   * the network, and a listing fetched under the old answer must be dropped
   * rather than served — see the `loader/volatile-update` listener in `apply`.
   */
  liveCatalog: Volatile<boolean>;
  /** How long a discovered listing is reused before refetching. */
  catalogTtlMs?: number;
}

/**
 * What the `providers` Config schema accepts before validation: the deployment
 * facts and user choices, none of them required.
 */
export type ProvidersConfigInput = {
  baseURLs?: Record<string, string>;
  streamIdleTimeoutMs?: number;
  retryPolicy?: RetryPolicyConfig;
  mode?: "subscription-only" | "all";
  liveCatalog?: boolean;
  catalogTtlMs?: number;
};

/**
 * Not annotated `z<Config>`: a volatile field's output type is `Volatile<T>`,
 * which `z<T>`'s invariant position cannot hold. The three-parameter schema type
 * is the annotation that can, and it is required rather than cosmetic — left to
 * inference, the nested `Volatile` inside the `baseURLs` dictionary has no name
 * the declaration emitter can write, so the build fails with `TS2742` ("the
 * inferred type of `Config` cannot be named without a reference to cosmokit").
 * Both `build` and `typecheck` report it here, because `tsconfig.base.json` sets
 * `declaration: true` and the diagnostic belongs to the declaration emitter even
 * under `--noEmit`. `themes`, `repos`, `voice` and `agents` get away with a bare
 * `z.object({...})` only because their volatile fields are scalar;
 * `formatters` sidesteps it differently, by naming its table type, and `lsp` and
 * `agent-tools` each needed an explicit annotation exactly as here.
 */
export const Config: z<ProvidersConfigInput, Config, "plain"> = z.object({
  // User choices: volatile, and the only fields this entry's form projects.
  baseURLs: z.dict(z.string()).default({}).volatile(),
  mode: z.union(["subscription-only", "all"]).default("subscription-only").volatile(),
  liveCatalog: z.boolean().default(true).volatile(),
  // Deployment facts: the latency and cost budgets an operator sized for this
  // installation, not preferences a person changes per session. They stay plain
  // so the form cannot offer them, and changing one restarts the entry — which
  // re-runs `apply` and re-registers the adapter under the new budgets, so a
  // budget edit reaches the next request either way.
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS),
  retryPolicy: RetryPolicySchema,
  catalogTtlMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS),
});

/** Validated, detached provider facts for the `providers` form. */
export interface ResolvedProvidersOptions {
  /**
   * Per-provider endpoint overrides. Read-only because it is a committed
   * volatile snapshot, which the runtime freezes: a settings write replaces the
   * whole reference rather than editing this object.
   */
  baseURLs: Readonly<Record<string, string>>;
  streamIdleTimeoutMs: number;
  retryPolicy: ReturnType<typeof resolveRetryPolicy>;
  mode: "subscription-only" | "all";
  liveCatalog: boolean;
  catalogTtlMs: number;
}

/**
 * The one explicit resolve step from the Config to validated provider facts.
 *
 * The three volatile fields are read through `.get()` at each call rather than
 * captured once: the Loader commits a settings write into the same reference
 * object this function was handed, so a value read at boot would go stale while
 * the reference kept looking live. The plain fields are read straight off the
 * Config, which *is* this fiber's boot snapshot — a change to one of them
 * remounts the entry and `apply` runs again with a new one.
 *
 * @param config - this entry's projected Config, carrying the live references.
 * @returns the validated facts every consumer resolves from.
 * @throws When a plain budget is out of range.
 */
export function resolveProvidersOptions(config: Config): ResolvedProvidersOptions {
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (
    !Number.isFinite(streamIdleTimeoutMs) ||
    streamIdleTimeoutMs <= 0 ||
    streamIdleTimeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new Error(
      `providers: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    );
  }
  const catalogTtlMs = config.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS;
  if (!Number.isFinite(catalogTtlMs) || catalogTtlMs <= 0 || catalogTtlMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `providers: catalogTtlMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    );
  }
  return {
    baseURLs: config.baseURLs.get(),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, "providers: retryPolicy"),
    mode: config.mode.get(),
    liveCatalog: config.liveCatalog.get(),
    catalogTtlMs,
  };
}

/** toConnection implementation. */
function toConnection(
  route: ProviderRoute,
  resolved: ResolvedProvidersOptions,
): ProviderConnection {
  return {
    displayName: route.displayName,
    dialectId: route.dialect,
    baseURL: resolved.baseURLs[route.id] ?? route.baseURL,
    headers: route.headers,
    authSlots: route.authSlots,
    models: route.models,
    defaultMaxTokens: route.defaultMaxTokens,
    defaultContextWindow: route.defaultContextWindow,
    streamIdleTimeoutMs: resolved.streamIdleTimeoutMs,
    retryPolicy: resolved.retryPolicy,
    ...(route.catalog === undefined || !resolved.liveCatalog ? {} : { catalog: route.catalog }),
  };
}

/**
 * The provider filter as a service: exposes the same gate the adapter enforces
 * at catalog, selection, and dispatch, so an agent-scoped remap row (a preset
 * watching `agent/request`) decides replacement from the identical policy
 * instead of duplicating mode or credential logic.
 */
export class ProviderPolicy extends Service {
  /** Constructs an instance. */
  constructor(
    ctx: Context,
    private readonly gateImpl: (provider: string) => Promise<ProviderGate | undefined>,
  ) {
    super(ctx, "dshProviders");
  }

  /**
   * Why one provider is currently unusable under the filter mode.
   * @param provider - a dsh provider id.
   * @returns the gate, or `undefined` when the provider is offered as-is.
   */
  gate(provider: string): Promise<ProviderGate | undefined> {
    return this.gateImpl(provider);
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    dshProviders: ProviderPolicy;
  }
}

/**
 * Applies the configuration to the context by resolving provider options.
 *
 * Declares that this plugin ships its own settings page for the form its Config
 * projects, resolves the plain budgets once so an invalid one is refused at load
 * rather than at the first request, and wires everything that has to react to a
 * committed volatile write.
 *
 * @param ctx - The context containing the logger and providers.
 * @param config - This entry's projected Config, carrying the live volatile references.
 * @throws Will throw an error if resolving the providers fails.
 */
export function apply(ctx: Context, config: Config): void {
  declareCustomSettingsPage(ctx);

  // The registry: `@dsh-stack/provider-<id>` extensions inject `providers`
  // and call `ctx.providers.register(route)` from their own `apply`, which
  // cordis runs after this one (see the `inject` comment above), so the
  // registry may hold zero routes for the rest of this function's body.
  new ProviderRegistry(ctx);

  /**
   * The volatile snapshots the last resolution was computed from. A volatile
   * reference hands back the same frozen snapshot object until the Loader commits
   * a new one, so identity here is exactly a change detector: stable between
   * commits, different on one. That replaces the removed settings section's
   * `setSource`, which swapped a captured Config for a newer one — there is no
   * captured Config left to swap, only references whose `.get()` is already live.
   */
  let lastSnapshots: readonly unknown[] | undefined;
  let lastGood: ResolvedProvidersOptions | undefined;
  /**
   * Returns the current resolved configuration of providers options.
   * Guarantees the configuration is valid and up-to-date.
   * If the configuration is invalid, keeps the last good configuration
   * and logs the error.
   * @returns The resolved providers options or the last good configuration.
   */
  const resolved = (): ResolvedProvidersOptions => {
    const snapshots = [config.baseURLs.get(), config.mode.get(), config.liveCatalog.get()];
    if (
      lastGood !== undefined &&
      lastSnapshots !== undefined &&
      snapshots.every((snapshot, index) => snapshot === lastSnapshots?.[index])
    )
      return lastGood;
    try {
      const next = resolveProvidersOptions(config);
      lastSnapshots = snapshots;
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === undefined) throw error;
      lastSnapshots = snapshots;
      ctx.logger.error(
        "providers: keeping the last good configuration after an invalid settings write",
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };
  resolved();

  const /** connections implementation. */
    connections = (provider: string): ProviderConnection =>
      toConnection(ctx.providers.get(provider), resolved());

  /**
   * Other registered routes for the same vendor as `provider` (#187): same
   * `<vendor>` base id (`openrouter-3` -> `openrouter`) and the same dialect
   * and base URL, so a numbering coincidence between two genuinely different
   * routes never gets treated as an interchangeable account. Ordered by
   * ascending numeric suffix (the unsuffixed id sorts first).
   */
  const rotationSiblings = (provider: string): readonly string[] => {
    const connection = connections(provider);
    const base = vendorBaseId(provider);
    return ctx.providers
      .ids()
      .filter(
        (id) =>
          id !== provider &&
          vendorBaseId(id) === base &&
          connections(id).dialectId === connection.dialectId &&
          connections(id).baseURL === connection.baseURL,
      )
      .sort((a, b) => vendorSuffix(a) - vendorSuffix(b));
  };

  const memory = new Map<string, string>();

  /**
   * Reads a configuration value for the given reference.
   * Guarantees returning the last good configuration if the current one is invalid.
   * Throws an error if the configuration is invalid and no last good configuration exists.
   * Logs an error and returns the last good configuration if the configuration is invalid.
   */
  const read = async (ref: string): Promise<string | undefined> => {
    const mem = memory.get(ref);
    if (mem !== undefined) return mem;
    const accounts = ctx.get("accounts") as AccountsService | undefined;
    const credentials = ctx.get("credentials") as CredentialProvider | undefined;
    if (accounts !== undefined) return (await accounts.resolve(ref))?.value;
    if (credentials !== undefined) return (await credentials.resolve(credentialRef(ref)))?.value;
    return undefined;
  };

  /**
   * Writes a configuration value for the given reference.
   * Guarantees that the configuration is updated if the current value is valid.
   * Logs an error and returns without updating if the current value is invalid and no last good configuration exists.
   * Throws an error if the current value is invalid and no last good configuration exists.
   */
  const write = async (ref: string, value: string): Promise<void> => {
    const accounts = ctx.get("accounts") as AccountsService | undefined;
    if (accounts !== undefined) {
      await accounts.set(ref, value);
      return;
    }
    memory.set(ref, value);
  };

  const refreshInflight = new Map<string, Promise<string | undefined>>();
  const refreshed = new Map<string, { access: string; expires: number }>();

  /**
   * Resolve an OAuth access token, refreshing it when the stored refresh token
   * exists and the access token has expired. The rotated bundle (access,
   * refresh, expires) is written back through the account seam so the next
   * request sees fresh material; without a vault, an in-process override keeps
   * this process on the rotated token. A failed refresh falls back to the
   * stored access token so the upstream request surfaces the real error.
   */
  const readToken = async (
    provider: string,
    refresher: OAuthRefresher,
  ): Promise<string | undefined> => {
    const value = await read(refresher.tokenRef);
    if (value === undefined || value.length === 0) return undefined;
    const fresh = refreshed.get(provider);
    if (fresh !== undefined && fresh.expires > Date.now()) return fresh.access;
    const refreshToken = await read(refresher.refreshRef);
    if (refreshToken === undefined || refreshToken.length === 0) return value;
    const expiresRaw = await read(refresher.expiresRef);
    // Accept epoch millis (refresh write-back) and ISO 8601 (login flows).
    const expires = expiresRaw !== undefined ? Number(expiresRaw) || Date.parse(expiresRaw) : NaN;
    if (!Number.isNaN(expires) && expires > Date.now()) return value;
    const clientId =
      refresher.clientId !== undefined
        ? refresher.clientId
        : await read(refresher.clientIdRef ?? "");
    if (clientId === undefined || clientId.length === 0) return value;
    const clientSecret =
      refresher.clientSecret !== undefined
        ? refresher.clientSecret
        : refresher.clientSecretRef !== undefined
          ? await read(refresher.clientSecretRef)
          : undefined;
    if (
      refresher.clientSecretRef !== undefined &&
      (clientSecret === undefined || clientSecret.length === 0)
    )
      return value;
    const spec: OAuthRefresher & { clientId: string } =
      refresher.clientSecretRef !== undefined
        ? { ...refresher, clientId, clientSecret }
        : { ...refresher, clientId };
    const inflight = refreshInflight.get(provider);
    if (inflight !== undefined) return inflight;
    /**
     * Attempts to refresh an access token if the current one is expired or not available.
     * Returns the current access token if it is valid, otherwise returns the value.
     *
     * @returns The access token if refresh is successful or the current value if refresh fails.
     */
    const attempt = () =>
      refreshOAuthToken(spec, refreshToken).then(async (token) => {
        // Write order matters for single-use rotating refresh tokens: persist
        // the NEW refresh token first. If the process dies after the provider
        // consumed the old token, the vault must hold the valid rotation, not
        // a fresh access token paired with a dead refresh token.
        if (token.refresh !== undefined) await write(refresher.refreshRef, token.refresh);
        await write(refresher.tokenRef, token.access);
        await write(refresher.expiresRef, String(token.expires));
        refreshed.set(provider, { access: token.access, expires: token.expires });
        return token.access;
      });
    const run = attempt().catch((err: unknown) => {
      if ((err as { permanent?: boolean }).permanent === true) throw err;
      // one retry for transient failures (network blip, token-endpoint 5xx/429)
      return new Promise<string>((resolve, reject) =>
        setTimeout(() => attempt().then(resolve, reject), 1000),
      );
    });
    const guarded = run.catch(async (err: unknown) => {
      if ((err as { permanent?: boolean }).permanent === true) {
        // The refresh grant is dead (consumed/rotated away). Drop the stale
        // in-process entry and surface a missing-credential error instead of
        // silently returning the expired access token forever.
        refreshed.delete(provider);
        return undefined;
      }
      return value;
    });
    refreshInflight.set(provider, guarded);
    guarded.finally(() => refreshInflight.delete(provider)).catch(() => {});
    return guarded;
  };

  /**
   * Resolve a credential reference for a quota probe. An OAuth token ref goes
   * through the refresher so the probe sends the same live token dispatch
   * would; everything else reads the account seam directly.
   */
  const probeToken = async (ref: string): Promise<string | undefined> => {
    for (const [provider, refresher] of Object.entries(OAUTH_REFRESHERS)) {
      if (refresher.tokenRef === ref) return readToken(provider, refresher);
    }
    return read(ref);
  };

  /** One credential snapshot per operation: the wire auth plus the slots it could not fill. */
  const credentialsFor = async (
    provider: string,
    connection: ProviderConnection,
  ): Promise<{ auth: DialectAuth; missing: string[]; stored: boolean }> => {
    const auth: DialectAuth =
      connection.headers !== undefined ? { headers: { ...connection.headers } } : {};
    // Local routes carry no credentials; the wire still wants a bearer shape.
    if (ctx.providers.get(provider).kind === "local") auth.token = "local";
    const missing: string[] = [];
    // Whether this route holds stored credential material at all, which is a
    // different question from whether that material still works. A provider
    // nobody ever configured should leave the selector silently; one whose
    // stored login went stale must say so, or re-authenticating looks
    // unnecessary.
    let stored = false;
    for (const slot of connection.authSlots as readonly ProviderRouteAuthSlot[]) {
      const refresher = slot.slot === "token" ? OAUTH_REFRESHERS[provider] : undefined;
      const value =
        refresher !== undefined ? await readToken(provider, refresher) : await read(slot.ref);
      if (value !== undefined && value.length > 0) {
        stored = true;
        if (slot.slot === "apiKey") auth.apiKey = value;
        else if (slot.slot === "token") auth.token = value;
        else if (slot.slot === "header" && slot.headerName !== undefined) {
          (auth.headers ??= {})[slot.headerName] = value;
        } else if (slot.cookieName !== undefined) (auth.cookies ??= {})[slot.cookieName] = value;
      } else {
        missing.push(slot.ref);
        // readToken answers undefined both for a route that was never logged
        // in and for one whose refresh grant was rejected. Only the raw record
        // separates them.
        if (refresher !== undefined) {
          const raw = await read(slot.ref);
          if (raw !== undefined && raw.length > 0) stored = true;
        }
      }
    }
    return { auth, missing, stored };
  };

  const /** missingCredential implementation. */
    missingCredential = (provider: string, missing: readonly string[]): LlmError =>
      new LlmError(
        `providers: no credential for "${provider}"; store ${missing.join(", ")} through the` +
          " account manager (credentials) or the harness credentials service",
        "MISSING_CREDENTIAL",
      );

  /** A route that was logged in once and whose stored login no longer resolves. */
  const staleCredential = (provider: string, missing: readonly string[]): LlmError =>
    new LlmError(
      `providers: the stored credential for "${provider}" is no longer valid` +
        ` (${missing.join(", ")} could not be resolved or refreshed); sign in again` +
        " from the account manager",
      "MISSING_CREDENTIAL",
    );

  /**
   * Attempts to resolve authentication credentials for a given provider.
   *
   * Returns an object containing the resolved authentication details, any missing credentials,
   * and a flag indicating if the credentials were found in storage.
   *
   * If no credentials are found and cannot be resolved, returns an error indicating the missing
   * credentials and the actions required to obtain them.
   */
  const resolveAuth = async (
    provider: string,
    connection: ProviderConnection,
  ): Promise<DialectAuth> => {
    const { auth, missing } = await credentialsFor(provider, connection);
    if (missing.length > 0) throw missingCredential(provider, missing);
    return auth;
  };

  /**
   * The filter gate: whether one provider may be offered under the current
   * mode. In `subscription-only`, billable pay-as-you-go routes are hidden
   * from discovery and refused everywhere, and subscription routes must be
   * logged in (their credential material present); in `all`, nothing is gated
   * and a missing credential surfaces on the request itself.
   */
  const gate = async (
    provider: string,
    connection: ProviderConnection,
  ): Promise<ProviderGate | undefined> => {
    const route = ctx.providers.get(provider);
    if (resolved().mode === "subscription-only" && route.kind === "api") {
      return {
        visible: false,
        reason: new LlmError(
          `providers: provider "${provider}" is a pay-as-you-go API route and is disabled` +
            ' in subscription-only mode (single seat); configure mode "all" to allow billed usage',
          "PROVIDER_DISABLED",
        ),
      };
    }
    // A route whose credentials do not resolve cannot serve a single request,
    // so it leaves the selector rather than appearing as a failure row. A
    // selector is a list of things you can pick; a provider you have no working
    // login for is not one, and rendering it as an error turns the picker into
    // a wall of "failed to load" for every route the plugin happens to ship.
    //
    // This does not hide the problem, it moves it to the surface built for it:
    // the quotas panel reports every route's status, including the ones absent
    // here, and the reason below still reaches logs and dispatch. The message
    // distinguishes a route that was never configured from one whose stored
    // login went stale, because only the second is something to act on.
    const { missing, stored } = await credentialsFor(provider, connection);
    if (missing.length > 0) {
      return {
        visible: false,
        reason: stored ? staleCredential(provider, missing) : missingCredential(provider, missing),
      };
    }
    return undefined;
  };

  let userId: AnonymousUserId | undefined;
  /**
   * Determines the visibility of a provider based on the current mode and its credentials.
   *
   * @param provider - The identifier of the provider to check.
   * @param connection - The connection details for the provider.
   * @returns A ProviderGate indicating whether the provider is visible or not, or undefined if not gated.
   *         If gated, provides a reason for its invisibility.
   */
  const resolveUserId = (): AnonymousUserId => (userId ??= getOrCreateAnonymousUserId());

  // The service gate is a boundary for callers that see arbitrary providers
  // (the agent-scoped remap row reads every request's provider): a provider
  // this plugin does not own is offered as-is, never an error, while the
  // adapter's own gate stays strict for the registered routes it serves.
  const policy = new ProviderPolicy(ctx, async (provider: string) => {
    if (!ctx.providers.has(provider)) return undefined;
    return gate(provider, connections(provider));
  });

  // One cache for the whole plugin: the selector reads many providers at once
  // and each route's listing is fetched once per TTL, not once per read.
  const modelCatalog = new ModelCatalog({ ttlMs: resolved().catalogTtlMs });

  const adapter = new DialectAdapter({
    getDialect: (id: DialectId) => ctx.dialects.get(id),
    options: connections,
    resolveAuth,
    gate,
    resolveUserId,
    catalog: modelCatalog,
    rotationSiblings,
    onRotate: (from, to, code) => {
      ctx.logger.warn(`providers: ${from} hit ${code}, retrying ${to}`);
    },
  });
  // Both `ctx.llm` registrations below throw if handed zero providers, which
  // this plugin's own registry legitimately holds until at least one
  // `@dsh-stack/provider-<id>` extension has run its `apply` (see the
  // `ProviderRegistry` construction above). So neither registers eagerly at
  // apply time; `syncRegistrations` performs the first (non-empty) register
  // and every later route-set change through the same handles' `replace`,
  // driven by `ctx.providers.onChange` — the identical "swap the live route
  // set without a restart" mechanism `ensureRegistrationFacts` already uses
  // below for policy and catalog-facts changes.
  let adapterRegistration: ReturnType<typeof ctx.llm.registerAdapter> | undefined;
  let directoryRegistration: ReturnType<typeof ctx.llm.registerConfigurableProviders> | undefined;
  const /** syncRegistrations implementation. */
    syncRegistrations = (): void => {
      const ids = [...ctx.providers.ids()];
      if (ids.length === 0) return;
      if (adapterRegistration === undefined) {
        adapterRegistration = ctx.llm.registerAdapter(ids, adapter);
      } else {
        adapterRegistration.replace(ids);
      }
      const entries = ctx.providers.list().map((route) => ({
        provider: route.id,
        displayName: route.displayName,
        settingsNs: NS,
        settingsPath: [],
      }));
      if (directoryRegistration === undefined) {
        directoryRegistration = ctx.llm.registerConfigurableProviders(entries);
      } else {
        directoryRegistration.replace(entries);
      }
    };
  ctx.providers.onChange(syncRegistrations);
  syncRegistrations();

  // A volatile write does NOT re-run `apply`: the Loader commits it into the
  // running references and notifies the owning fiber here, leaving this plugin
  // mounted. So this is where the removed settings section's `onChange` hook
  // lives now, and the event carries the committed paths — one per volatile
  // field whose value actually moved — which is strictly more than the old hook
  // had: it names the fields, so there is nothing left to compare and no
  // deep-equality over resolved facts. `catalogTtlMs` and `retryPolicy` are
  // absent on purpose: they are plain deployment facts, so editing one remounts
  // the entry, which re-registers the adapter under the new budgets anyway.
  //
  // `loader/volatile-update` is declared by `@deepseek-ai/cordis-plugin-loader`,
  // which this plugin does not depend on, so the listener's signature is spelled
  // out here rather than borrowed from that package's `Events` augmentation.
  const onVolatileUpdate = ctx.on as (
    event: "loader/volatile-update",
    listener: (paths: readonly (readonly string[])[]) => void,
  ) => () => boolean;
  onVolatileUpdate("loader/volatile-update", (paths) => {
    const fields = new Set(paths.map((path) => path[0]));
    // An endpoint override or the live-catalog toggle changes what a listing
    // would return, so drop the discovered entries and let the next read refetch
    // rather than serving a catalog resolved under the previous answer.
    if (fields.has("baseURLs") || fields.has("liveCatalog")) modelCatalog.clear();
    // The filter is enforced by `gate`, which every catalog, selection and
    // dispatch already consults live — but the selector only re-asks when the
    // adapter registration is replaced, which is what re-fires
    // `llm/adapters-updated`. Without this, widening the mode would leave the
    // picker showing the routes it hid a moment ago.
    if (fields.has("mode")) adapterRegistration?.replace([...ctx.providers.ids()]);
  });

  // Wire the quotas subpackage: registry, web routes, built-in probe providers,
  // and staggered 15-minute auto-refresh.
  //
  // The probes resolve their credential through the same refreshing path as
  // dispatch. Reading the stored value instead turned every subscription light
  // red as soon as its access token aged out — a status light that reports the
  // token's age rather than whether the credential works is worse than none.
  applyQuotas(ctx, { resolveToken: probeToken });
}
