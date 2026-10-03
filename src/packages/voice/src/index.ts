/**
 * voice — a natural, human-sounding voice for the dsh harness.
 *
 * Three layers:
 *
 *  1. Browser UI (client.js, hand-authored): a mic button on the composer
 *     (Web Speech API with interim results, falling back to server-proxied
 *     Whisper), a per-message read-aloud action playing neural TTS instead of
 *     the browser's speechSynthesis, and a "Voice" settings section.
 *  2. HTTP routes (routes.ts) on the dsh `webServer`: /voice/api/tts streams
 *     synthesized audio from an OpenAI-compatible speech endpoint so keys
 *     never reach the client; /voice/api/stt proxies Whisper transcriptions;
 *     /voice/api/config publishes the non-secret client slice.
 *  3. Agent tools (tools.ts): `voice_speak` and `voice_transcribe`, so the
 *     agent can speak with the same good voice and hear recordings.
 *
 * Credentials resolve per request from the dsh account vault via
 * `ctx.accounts` (credentials), referenced by name (`OPENAI_API_KEY` by
 * default) and never stored by this plugin. Providers are a table
 * (providers.ts): base URL, path, auth style, voices, models — any
 * OpenAI-compatible gateway works by configuration.
 * @module voice
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-tools";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { VoiceConfig } from "./config.js";
import { makeConfigHandler, makeSttHandler, makeTtsHandler } from "./routes.js";
import { registerVoiceTools } from "./tools.js";
import type { AccountsLike } from "./speech.js";

export { Config, VOICE_NS, type VoiceConfig } from "./config.js";
export {
  TTS_PROVIDERS,
  authHeaders,
  joinUrl,
  resolveTts,
  type AuthStyle,
  type ResolvedTts,
  type TtsProvider,
  type VoiceInfo,
} from "./providers.js";
export {
  resolveCredential,
  synthesizeSpeech,
  transcribeAudio,
  type AccountsLike,
  type SttSettings,
  type Transcription,
} from "./speech.js";
export { makeConfigHandler, makeSttHandler, makeTtsHandler } from "./routes.js";
export { registerVoiceTools } from "./tools.js";

/** The webServer route shape this plugin registers (host-owned contract). */
interface WebRouteLike {
  kind: "exact" | "prefix";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The dsh host web server route registry. */
    webServer: { register(route: WebRouteLike): () => void };
    /** The credentials account vault service. */
    accounts: AccountsLike;
  }
}

export const name = "voice";
export const inject = ["tools", "settings", "webServer", "accounts"];

/**
 * Wire the plugin: declare this plugin's own page for the `voice` settings
 * form, mount the three /voice/api routes, and register the agent tools.
 *
 * The `voice` form is the `Config` this plugin already exports and its
 * namespace is this plugin's own entry id, so there is nothing to install. This
 * plugin ships its own page, so the automatic-page policy is turned off.
 *
 * A settings edit is reconciled by writing the profile patch and then
 * restarting this fiber through the Loader, so the `config` handed to this
 * call is the whole live story: every consumer below reads it per request, and
 * a settings edit reaches them by re-running this function with the new config.
 *
 * @param ctx - the plugin context carrying tools, settings, webServer, accounts.
 * @param config - the active profile entry this plugin was applied with.
 */
export function apply(ctx: Context, config: VoiceConfig): void {
  declareCustomSettingsPage(ctx);

  const accounts: AccountsLike | undefined = ctx.accounts;
  /**
   * The config this entry was applied with, read at call time.
   *
   * A settings write reconciles the profile and restarts this fiber, so `apply`
   * runs again with the new config rather than this closure observing a mutation.
   *
   * @returns the resolved voice config.
   */
  const current = (): VoiceConfig => config;

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: "/voice/api/tts",
        handler: makeTtsHandler(current, accounts),
      }),
    "voice: /voice/api/tts route",
  );
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: "/voice/api/stt",
        handler: makeSttHandler(current, accounts),
      }),
    "voice: /voice/api/stt route",
  );
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: "/voice/api/config",
        handler: makeConfigHandler(current),
      }),
    "voice: /voice/api/config route",
  );

  registerVoiceTools(ctx.tools, current, accounts);

  ctx
    .logger("[voice]")
    .info("mounted /voice/api/{tts,stt,config} + voice_speak + voice_transcribe");
}
