/**
 * The `voice` settings namespace schema. This plugin consumes and extends the
 * harness' existing `voice` seam (the namespace the voice tooling already
 * registers), keeping the established `stt` keys and adding the neural-TTS
 * `tts` table and the `readAloud` section. Credentials are references into
 * the dsh account vault (`credentialRef`), never stored values.
 * @module voice/config
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** The settings namespace this plugin owns. */
export const VOICE_NS = settingsNamespace("voice");

/** Neural text-to-speech settings. */
export interface TtsConfig {
  enabled: boolean;
  /** Provider-table row id; `custom` covers any OpenAI-compatible gateway. */
  provider: string;
  /** Base URL override (required for `custom`; e.g. a gateway or local server). */
  apiBase: string;
  /** Speech endpoint path; empty inherits the provider row. */
  path: string;
  /** Account-vault credential reference resolved per request. */
  credentialRef: string;
  /** Natural-voice model, e.g. gpt-4o-mini-tts or tts-1-hd. */
  model: string;
  voice: string;
  speed: number;
  format: string;
  /** Steering instructions for models that accept them (gpt-4o-mini-tts). */
  instructions: string;
  timeoutMs: number;
}

export const TtsConfig: z<TtsConfig> = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default("openai"),
  apiBase: z.string().default(""),
  path: z.string().default(""),
  credentialRef: z.string().role("credential-ref").default("OPENAI_API_KEY"),
  model: z.string().default("gpt-4o-mini-tts"),
  voice: z.string().default("nova"),
  speed: z.number().min(0.25).max(4).default(1),
  format: z.string().default("mp3"),
  instructions: z.string().default(""),
  timeoutMs: z.number().min(1).default(60000),
});

/** Speech-to-text engine selection for the composer mic button. */
export type SttEngine = "auto" | "browser" | "whisper";

export const SttEngine: z<SttEngine> = z.union([
  z.const("auto"),
  z.const("browser"),
  z.const("whisper"),
]);

/** Speech-to-text settings: the composer mic and the voice_transcribe tool. */
export interface SttConfig {
  enabled: boolean;
  /**
   * `browser` uses the Web Speech API with interim results, `whisper`
   * records and posts to the server-proxied /voice/api/stt route, and
   * `auto` prefers the browser and falls back to Whisper where the browser
   * lacks SpeechRecognition.
   */
  engine: SttEngine;
  /** Whisper-compatible base URL for the /voice/api/stt route. */
  apiBase: string;
  /** Transcriptions endpoint path. */
  path: string;
  credentialRef: string;
  model: string;
  /** ISO-639-1 hint (zh / en / …); empty = auto-detect. */
  language: string;
  timeoutMs: number;
}

export const SttConfig: z<SttConfig> = z.object({
  enabled: z.boolean().default(true),
  engine: SttEngine.default("auto"),
  apiBase: z.string().default("https://api.openai.com/v1"),
  path: z.string().default("/audio/transcriptions"),
  credentialRef: z.string().role("credential-ref").default("OPENAI_API_KEY"),
  model: z.string().default("whisper-1"),
  language: z.string().default(""),
  timeoutMs: z.number().min(1).default(120000),
});

/** Read-aloud behavior settings. */
export interface ReadAloudConfig {
  /** Automatically read each new assistant reply aloud once it settles. */
  autoRead: boolean;
}

export const ReadAloudConfig: z<ReadAloudConfig> = z.object({
  autoRead: z.boolean().default(false),
});

/** The validated `voice` settings section. */
export interface VoiceConfig {
  tts: TtsConfig;
  stt: SttConfig;
  readAloud: ReadAloudConfig;
}

export const Config: z<VoiceConfig> = z.object({
  tts: TtsConfig.default({
    enabled: true,
    provider: "openai",
    apiBase: "",
    path: "",
    credentialRef: "OPENAI_API_KEY",
    model: "gpt-4o-mini-tts",
    voice: "nova",
    speed: 1,
    format: "mp3",
    instructions: "",
    timeoutMs: 60000,
  }),
  stt: SttConfig.default({
    enabled: true,
    engine: "auto",
    apiBase: "https://api.openai.com/v1",
    path: "/audio/transcriptions",
    credentialRef: "OPENAI_API_KEY",
    model: "whisper-1",
    language: "",
    timeoutMs: 120000,
  }),
  readAloud: ReadAloudConfig.default({ autoRead: false }),
});
