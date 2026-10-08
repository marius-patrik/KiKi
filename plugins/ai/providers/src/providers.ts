/**
 * Route descriptors for the dsh provider adapters (five subscription routes
 * plus ten billable API-key routes). A route couples a provider id with the
 * wire dialect it speaks, the endpoint it talks to, the fixed headers and
 * credential slots it needs, and the advisory model catalog it advertises to
 * discovery consumers.
 * @module providers/providers
 */

import type { DialectId } from "@dsh-stack/dialects";
import type { CatalogSource } from "./catalog.js";
import { ANTIGRAVITY_PROJECT_HEADER } from "@dsh-stack/dialect-antigravity";

/** How a provider authenticates; the launcher filter and account UI group on this. */
export type AuthKind = "api-key" | "oauth" | "none";

/** Whether a provider is pay-as-you-go or a flat subscription. */
export type ProviderKind = "api" | "subscription" | "local";

/** The credential material a route needs on every request. */
export type CredentialSlotKind = "apiKey" | "token" | "cookie" | "header";

/** One credential slot: what it fills in the wire auth and where it is stored. */
export interface CredentialSlot {
  slot: CredentialSlotKind;
  /** Wire cookie name; required exactly when `slot === 'cookie'`. */
  cookieName?: string;
  /**
   * Wire header name; required exactly when `slot === 'header'`. For per-account
   * facts a route must send that are not themselves the credential — the
   * Antigravity project id, which the dialect cannot fetch for itself.
   */
  headerName?: string;
  /** Reference name stored through the account seam (vault or credential env). */
  ref: string;
}

/** How a quota probe authenticates; default is `Authorization: Bearer`. */
export type ProbeAuthStyle = "bearer" | "x-api-key" | "query";

/**
 * A lightweight quota probe for a route: the endpoint the quota registry hits
 * to report availability. The probe reuses the route's fixed headers and its
 * first credential slot as the token reference, so only the probe-specific
 * facts live here.
 */
export interface ProviderProbe {
  /** Probe endpoint; usually the provider's model-listing URL. */
  url: string;
  /** HTTP method; defaults to GET. */
  method?: string;
  /** Request body; sent with a JSON content type when present. */
  body?: string;
  /**
   * Extra headers for this probe alone, merged over the route's fixed headers.
   * A streaming endpoint that is probed without its `accept` answers 500
   * instead of the status the light is asking about.
   */
  headers?: Record<string, string>;
  /** How the token is sent; defaults to `bearer`. */
  authStyle?: ProbeAuthStyle;
}

/** One selectable reasoning effort for a model. */
export interface ProviderReasoningEffort {
  /** Value passed back as `GenerateOptions.reasoningEffort`. */
  id: string;
  /** Label shown in the selector. */
  name: string;
  /** What distinguishes this effort from the neighbouring ones. */
  description?: string;
}

/**
 * Selectable reasoning efforts for one model. The harness already carries
 * these to the model picker (`LlmResolvedModelInfo.reasoning`); declaring them
 * here is what makes the picker offer effort at all for a dsh route.
 */
export interface ProviderReasoning {
  efforts: readonly ProviderReasoningEffort[];
  /** Effort used when the caller names none; absence keeps the provider's own. */
  defaultEffort?: string;
}

/** One advisory model entry advertised for a route. */
export interface ProviderCatalogModel {
  /** Wire model id accepted by the endpoint. */
  id: string;
  /** Selector label; defaults to `id`. */
  name?: string;
  /** Known combined context capacity. */
  contextWindow: number;
  /** Per-request output cap for this model. */
  maxTokens: number;
  /** Selectable reasoning efforts, for models that expose them. */
  reasoning?: ProviderReasoning;
}

/** A statically declared provider route. */
export interface ProviderRoute {
  /** Stable provider id used by `ctx.llm` (`GenerateOptions.provider`). */
  id: string;
  /** Human name for selectors and diagnostics. */
  displayName: string;
  /** Pay-as-you-go vs subscription, for the provider filter. */
  kind: ProviderKind;
  /** How the route authenticates, for the account manager and filter. */
  authKind: AuthKind;
  /** Wire dialect the route speaks. */
  dialect: DialectId;
  /** Default endpoint; `{model}` is substituted with the request model when present. */
  baseURL: string;
  /**
   * Fixed headers merged into every request of this route (identity or
   * protocol-version markers the wire requires beyond Authorization).
   */
  headers?: Record<string, string>;
  /** Credential slots resolved per request. */
  authSlots: readonly CredentialSlot[];
  /** Advisory models advertised to discovery consumers. */
  models: readonly ProviderCatalogModel[];
  /** Default per-request output cap. */
  defaultMaxTokens: number;
  /** Default context capacity used for uncatalogued models. */
  defaultContextWindow: number;
  /** Quota probe for the quotas registry; omitted routes are not probed. */
  probe?: ProviderProbe;
  /**
   * Live model-listing endpoint. When present the adapter discovers this
   * route's models from the provider and treats `models` above as the
   * fallback, so a new model release reaches the selector without an edit
   * here. Routes that publish no listing (Gemini's Code Assist surface) omit
   * it and stay on the static table.
   */
  catalog?: CatalogSource;
}

/**
 * The effort ladder shared by the routes whose wire takes a named level
 * (`reasoning_effort` on the OpenAI wire, a thinking budget on Anthropic's).
 * One vocabulary keeps the picker consistent across providers rather than
 * showing a different set of words per route.
 */
export const EFFORTS: ProviderReasoning = {
  efforts: [
    { id: "low", name: "Low", description: "Answer quickly, with little deliberation" },
    { id: "medium", name: "Medium", description: "Balance deliberation against latency" },
    { id: "high", name: "High", description: "Deliberate at length before answering" },
  ],
  defaultEffort: "medium",
};

/**
 * The vendor a numbered account id belongs to: strips a trailing `-<N>`
 * (`openrouter-3` -> `openrouter`; `openrouter` itself is already bare).
 * Matches the numbered-account naming convention `.data/settings.yaml`
 * already uses across every multi-account vendor (#187). Exported so
 * `@dsh-stack/provider-rotation` and the quotas web routes share this
 * grouping instead of re-deriving it.
 */
export function vendorBaseId(provider: string): string {
  return provider.replace(/-\d+$/, "");
}

/** The numbered suffix of an account id (bare ids sort first, at 1). */
export function vendorSuffix(provider: string): number {
  const match = /-(\d+)$/.exec(provider);
  return match === null ? 1 : Number(match[1]);
}

/**
 * Credential-slot and route helpers shared by every provider extension.
 * Exported so `@dsh-stack/provider-<id>` extensions build their `ProviderRoute`
 * with the same conventions the routes used before they were split out of
 * this package's static table.
 */
export const TOKEN = (ref: string): CredentialSlot => ({ slot: "token", ref });
/** API_KEY implementation. */
export const API_KEY = (ref: string): CredentialSlot => ({ slot: "apiKey", ref });
/** HEADER implementation. */
export const HEADER = (headerName: string, ref: string): CredentialSlot => ({
  slot: "header",
  headerName,
  ref,
});
/**
 * Returns the headers as-is.
 *
 * @param headers - A record of header key-value pairs.
 * @returns The same record of header key-value pairs.
 */
export const HEADERS = (headers: Record<string, string>) => headers;

/**
 * Claude Haiku 4.5, advertised identically by every route that reaches the
 * Anthropic model family (subscription, direct API, and the Zen aggregator).
 */
export const CLAUDE_HAIKU_MODEL: ProviderCatalogModel = {
  id: "claude-haiku-4-5",
  name: "Claude Haiku 4.5",
  contextWindow: 200_000,
  maxTokens: 64_000,
  reasoning: EFFORTS,
};

/**
 * The Kimi model catalog entries served identically by both the API-key and
 * subscription routes (they hit the same endpoint and the same underlying
 * catalog). Declared once so the two routes don't drift apart on a rename.
 */
export function kimiCoreModels(): ProviderCatalogModel[] {
  return [
    {
      id: "kimi-k3",
      name: "Kimi K3",
      contextWindow: KIMI_K3_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      contextWindow: KIMI_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      contextWindow: KIMI_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "kimi-k2.5",
      name: "Kimi K2.5",
      contextWindow: KIMI_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
    },
  ];
}

// Per-model windows, cross-checked against GET https://api.kimi.com/coding/v1/models
// (2026-08-18): K3 carries the 1M window, every other coding model 256k. The
// wire ids below are the aliases this route has been serving; the catalog
// endpoint lists them under its own names (kimi-for-coding, k3, k3-256k).
export const KIMI_CONTEXT = 262_144;
export const KIMI_K3_CONTEXT = 1_048_576;
export const KIMI_MAX_OUTPUT = 256_000;
export const CLAUDE_CONTEXT = 1_000_000;
export const CLAUDE_MAX_OUTPUT = 128_000;
export const GEMINI_CONTEXT = 1_000_000;
export const GEMINI_MAX_OUTPUT = 64_000;
export const OPENAI_MAX_OUTPUT = 128_000;
export const OPENAI_DEFAULT_CONTEXT = 128_000;
export const XAI_CONTEXT = 256_000;
export const XAI_MAX_OUTPUT = 32_000;
export const MISTRAL_CONTEXT = 128_000;
export const MISTRAL_MAX_OUTPUT = 8_000;
export const DEEPSEEK_CONTEXT = 128_000;
export const DEEPSEEK_MAX_OUTPUT = 8_000;
export const GROQ_CONTEXT = 128_000;
export const GROQ_MAX_OUTPUT = 8_000;
export const ZEN_CONTEXT = 256_000;
export const ZEN_MAX_OUTPUT = 64_000;
export const ZEN_CLAUDE_CONTEXT = 1_000_000;
export const ZEN_CLAUDE_MAX_OUTPUT = 128_000;
export const CEREBRAS_CONTEXT = 128_000;
export const CEREBRAS_MAX_OUTPUT = 8_000;
export const ZAI_CONTEXT = 128_000;
export const ZAI_MAX_OUTPUT = 8_000;
