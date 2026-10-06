/**
 * Provider-agnostic TTS provider table and resolution. Each row describes one
 * OpenAI-compatible speech endpoint family — base URL, endpoint path, auth
 * style, advertised voices and models — so gateways and local servers work by
 * configuration alone (`provider: custom` + `apiBase`). Resolution merges a
 * table row with the user's `voice.tts` settings into one
 * {@link ResolvedTts} the speech client consumes. All but `path`,
 * `instructions` and `timeoutMs` are user choices and so are volatile fields,
 * so resolution reads them from their live references.
 * @module voice/providers
 */

import type { Volatile } from "@deepseek-ai/cordis";
import type { TtsConfig } from "./config.js";

/** How the upstream expects its credential: HTTP auth style. */
export type AuthStyle = "bearer" | "api-key" | "none";

/** One selectable voice advertised by a provider row. */
export interface VoiceInfo {
  id: string;
  label: string;
}

/** One row of the TTS provider table. */
export interface TtsProvider {
  /** Stable provider id referenced by `voice.tts.provider`. */
  id: string;
  /** Human name shown by configuration surfaces. */
  label: string;
  /** Default base URL; empty means the user MUST set `voice.tts.apiBase`. */
  baseURL: string;
  /** Speech endpoint path appended to the base URL. */
  path: string;
  /** HTTP auth style for the endpoint. */
  auth: AuthStyle;
  /** Default vault/env credential reference; `voice.tts.credentialRef` overrides. */
  credentialRef: string;
  /** Advertised models, best-sounding first (informational; any string saves). */
  models: string[];
  /** Advertised voices for the picker; empty means free-form. */
  voices: VoiceInfo[];
  /** Whether the endpoint honors the `speed` request field. */
  supportsSpeed: boolean;
  /** Whether the endpoint honors an `instructions` steering field. */
  supportsInstructions: boolean;
}

const OPENAI_VOICES: VoiceInfo[] = [
  { id: "nova", label: "Nova — warm, natural female" },
  { id: "shimmer", label: "Shimmer — clear, bright female" },
  { id: "alloy", label: "Alloy — neutral, balanced" },
  { id: "ash", label: "Ash — calm male" },
  { id: "coral", label: "Coral — expressive female" },
  { id: "echo", label: "Echo — smooth male" },
  { id: "fable", label: "Fable — narrative male" },
  { id: "onyx", label: "Onyx — deep male" },
  { id: "sage", label: "Sage — measured female" },
];

/** The built-in provider table. `custom` covers any OpenAI-compatible gateway. */
export const TTS_PROVIDERS: TtsProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    path: "/audio/speech",
    auth: "bearer",
    credentialRef: "OPENAI_API_KEY",
    models: ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"],
    voices: OPENAI_VOICES,
    supportsSpeed: true,
    supportsInstructions: true,
  },
  {
    id: "custom",
    label: "OpenAI-compatible endpoint",
    baseURL: "",
    path: "/audio/speech",
    auth: "bearer",
    credentialRef: "OPENAI_API_KEY",
    models: [],
    voices: [],
    supportsSpeed: true,
    supportsInstructions: false,
  },
];

/**
 * The `voice.tts` settings slice resolution consumes.
 *
 * Everything except `path`, `instructions` and `timeoutMs` is a user choice and
 * so is volatile: those are live references the Loader commits a settings write
 * into. Resolution runs per request, so reading each through `.get()` is what
 * makes a settings edit take effect without a restart. The three plain fields
 * are deployment facts about the chosen endpoint.
 */
/**
 * The speech settings this resolver reads.
 *
 * Derived from the entry's own Config rather than redeclared, so a field cannot be
 * added to one and forgotten in the other. `enabled` is the only field the
 * resolver does not take, because the route that calls it has already consulted it.
 */
export type TtsSettings = Omit<TtsConfig, "enabled">;

/** One fully resolved speech request target. */
export interface ResolvedTts {
  /** Provider row the settings resolved against. */
  provider: TtsProvider;
  /** Absolute endpoint URL (base + path, single slash). */
  url: string;
  /** Effective credential reference (config override wins over the row default). */
  credentialRef: string;
  model: string;
  voice: string;
  speed: number;
  format: string;
  /** Steering instructions, empty when unsupported or unset. */
  instructions: string;
  timeoutMs: number;
}

/**
 * Build the HTTP auth headers for one resolved credential.
 * @param auth - endpoint auth style.
 * @param key - revealed credential; may be empty for keyless endpoints.
 * @returns Header record to merge into the upstream request.
 */
export function authHeaders(auth: AuthStyle, key: string): Record<string, string> {
  if (key.length === 0 || auth === "none") return {};
  if (auth === "api-key") return { "api-key": key };
  return { Authorization: `Bearer ${key}` };
}

/** Join a base URL and an endpoint path with exactly one slash. */
export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Resolve the effective TTS target: provider row from the table, then user
 * overrides for base URL, path, credential reference, model, and voice.
 *
 * Every user choice is read from its live reference here rather than captured
 * earlier, so a settings edit is reflected by the very next request.
 * @param settings - the live `voice.tts` settings slice.
 * @returns The fully resolved speech target.
 * @throws When the provider id is unknown, or the effective base URL is empty.
 */
export function resolveTts(settings: TtsSettings): ResolvedTts {
  const provider = TTS_PROVIDERS.find((row) => row.id === settings.provider.get());
  if (provider === undefined) {
    const known = TTS_PROVIDERS.map((row) => row.id).join(", ");
    throw new Error(`voice: unknown tts provider "${settings.provider.get()}" (known: ${known})`);
  }
  const apiBase = settings.apiBase.get();
  const baseURL = apiBase || provider.baseURL;
  if (baseURL.length === 0) {
    throw new Error(
      `voice: provider "${provider.id}" needs a base URL — set voice.tts.apiBase (e.g. https://api.openai.com/v1 or your gateway)`,
    );
  }
  const path = settings.path || provider.path;
  return {
    provider,
    url: joinUrl(baseURL, path),
    credentialRef: settings.credentialRef.get() || provider.credentialRef,
    model: settings.model.get(),
    voice: settings.voice.get(),
    speed: settings.speed.get(),
    format: settings.format.get(),
    instructions: provider.supportsInstructions ? settings.instructions : "",
    timeoutMs: settings.timeoutMs,
  };
}
