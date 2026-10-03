/**
 * The `voice` settings namespace schema. This plugin consumes and extends the
 * harness' existing `voice` seam (the namespace the voice tooling already
 * registers), keeping the established `stt` keys and adding the neural-TTS
 * `tts` table and the `readAloud` section. Credentials are references into
 * the dsh account vault (`credentialRef`), never stored values.
 *
 * Since 0.2.0 the settings service projects an entry's *volatile* Config fields
 * and nothing else, so every field here is classified. A field a person picks in
 * the Voice settings page is a user choice: it is declared `.volatile()`, it
 * reaches the browser as part of this entry's form, and the Loader commits a
 * write into that same live reference, so it must be read through `.get()`.
 * A deployment fact stays plain — it is not part of the form, so no settings
 * write may address it and an edit to it restarts the plugin instead of landing
 * under the user's cursor. The split is exactly the set of paths `client.js`
 * writes, which `check-plugin.mjs` enforces against this schema.
 * @module voice/config
 */

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** The settings namespace this plugin owns. */
export const VOICE_NS = settingsNamespace("voice");

/** Neural text-to-speech settings. */
export interface TtsConfig {
  enabled: Volatile<boolean>;
  /** Provider-table row id; `custom` covers any OpenAI-compatible gateway. */
  provider: Volatile<string>;
  /** Base URL override (required for `custom`; e.g. a gateway or local server). */
  apiBase: Volatile<string>;
  /** Speech endpoint path; empty inherits the provider row. */
  path: string;
  /** Account-vault credential reference resolved per request. */
  credentialRef: Volatile<string>;
  /** Natural-voice model, e.g. gpt-4o-mini-tts or tts-1-hd. */
  model: Volatile<string>;
  /** The chosen voice, held as a live reference; read it with `.get()`. */
  voice: Volatile<string>;
  /** The chosen playback rate, held as a live reference; read it with `.get()`. */
  speed: Volatile<number>;
  /** The chosen container for synthesized audio, held as a live reference. */
  format: Volatile<string>;
  /** Steering instructions for models that accept them (gpt-4o-mini-tts). */
  instructions: string;
  timeoutMs: number;
}

export const TtsConfig = z.object({
  // User choices: the Voice page's "Text to speech" block edits exactly these,
  // and each is a preference a person changes per deployment rather than a fact
  // about it. Enabling TTS, picking a gateway row, pointing a `custom` row at a
  // base URL, choosing which vault entry to bill, and choosing model/voice/rate/
  // container are all answers to "which voice", not to "how is it wired".
  enabled: z.boolean().default(true).volatile(),
  provider: z.string().default("openai").volatile(),
  apiBase: z.string().default("").volatile(),
  credentialRef: z.string().role("credential-ref").default("OPENAI_API_KEY").volatile(),
  model: z.string().default("gpt-4o-mini-tts").volatile(),
  voice: z.string().default("nova").volatile(),
  speed: z.number().min(0.25).max(4).default(1).volatile(),
  format: z.string().default("mp3").volatile(),
  // Deployment facts: the upstream contract of the chosen endpoint, and the
  // latency budget its operator sized. These describe how the gateway is
  // addressed, not how the voice sounds, so they are not part of the form.
  path: z.string().default(""),
  instructions: z.string().default(""),
  timeoutMs: z.number().min(1).default(60000),
});

/** Speech-to-text engine selection for the composer mic button. */
export type SttEngine = "auto" | "browser" | "whisper";

export const SttEngine = z
  .union([z.const("auto"), z.const("browser"), z.const("whisper")])
  // User choice: whether the mic is transcribed by the browser or by the
  // server is the one thing about speech input a person decides per machine.
  .default("auto")
  .volatile();

/** Speech-to-text settings: the composer mic and the voice_transcribe tool. */
export interface SttConfig {
  enabled: boolean;
  /**
   * `browser` uses the Web Speech API with interim results, `whisper`
   * records and posts to the server-proxied /voice/api/stt route, and
   * `auto` prefers the browser and falls back to Whisper where the browser
   * lacks SpeechRecognition.
   */
  engine: Volatile<SttEngine>;
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

export const SttConfig = z.object({
  enabled: z.boolean().default(true),
  // User choice: the Voice page's "Mic engine" select. Whether the endpoint the
  // operator runs is reachable is not a person's choice, so the fields
  // addressing it stay plain below.
  engine: SttEngine,
  // Deployment facts: which Whisper-compatible server this node transcribes
  // against, where it lives, which vault entry authenticates it, and the
  // latency budget an operator sized for it.
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
  autoRead: Volatile<boolean>;
}

export const ReadAloudConfig = z.object({
  // User choice: whether replies are spoken unprompted is a reading preference,
  // and it is the one field of the read-aloud behavior a person owns.
  autoRead: z.boolean().default(false).volatile(),
});

/** The validated `voice` settings section. */
export interface VoiceConfig {
  tts: TtsConfig;
  stt: SttConfig;
  readAloud: ReadAloudConfig;
}

export const Config = z.object({
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
