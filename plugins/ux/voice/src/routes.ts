/**
 * Browser-facing HTTP routes mounted on the dsh `webServer`. The browser
 * never sees a credential: the TTS and STT routes proxy their upstreams
 * server-side, and the config route publishes only the non-secret slice the
 * client bundle needs (engine choices, voice list, current voice/speed).
 * @module voice/routes
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { TTS_PROVIDERS, resolveTts } from "./providers.js";
import {
  resolveCredential,
  synthesizeSpeech,
  transcribeAudio,
  type AccountsLike,
} from "./speech.js";
import type { VoiceConfig } from "./config.js";

/** Read the whole request body. */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Rejects non-POST requests by sending a 405 response and returns true to stop further handling.
 * @param req - The incoming HTTP request.
 * @param res - The HTTP response object to send the rejection message.
 * @returns true if the request is not POST, indicating further handling should stop; otherwise, false.
 */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/**
 * Sends an error response based on the provided error object and status code.
 *
 * @param res - The HTTP response object to send the error message.
 * @param err - The error object containing a `code` and `message` for specific handling.
 * @param notConfiguredStatus - The status code to use for "NOT_CONFIGURED" errors (default 400).
 * @returns true if the error is "NOT_CONFIGURED", indicating further handling should stop; otherwise, false.
 */
function sendError(res: ServerResponse, err: unknown, notConfiguredStatus = 400): void {
  const e = err as { code?: string; message?: string };
  const status = e?.code === "NOT_CONFIGURED" ? notConfiguredStatus : 502;
  sendJson(res, status, { error: e?.message ?? String(err) });
}

/** The config getter the handlers read per request (settings-reload safe). */
export type ConfigSource = () => VoiceConfig;

/** Reject a non-POST request with 405; returns whether the caller should stop handling. */
function rejectNonPost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return true;
  }
  return false;
}

/**
 * POST /voice/api/tts — synthesize `{text, voice?, speed?, format?}` through
 * the resolved provider and stream the upstream audio body straight back, so
 * playback starts as the first bytes land and keys never reach the client.
 * @param current - live voice-config source.
 * @param accounts - the account vault seam for credential resolution.
 * @returns The webServer route handler.
 */
export function makeTtsHandler(current: ConfigSource, accounts: AccountsLike | undefined) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (rejectNonPost(req, res)) return;
      const raw = await readBody(req);
      let payload: { text?: unknown; voice?: unknown; speed?: unknown; format?: unknown };
      try {
        payload = JSON.parse(raw.toString("utf8") || "{}") as typeof payload;
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return;
      }
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (text.length === 0) {
        sendJson(res, 400, { error: "empty text" });
        return;
      }
      const config = current();
      // `tts.enabled` is a volatile user choice, so it is read through its
      // reference: a `Volatile` object is always truthy, so a missing `.get()`
      // would silently turn this guard into dead code.
      if (!config.tts.enabled.get()) {
        sendJson(res, 403, { error: "TTS is disabled (voice.tts.enabled)" });
        return;
      }
      const target = resolveTts(config.tts);
      const apiKey = await resolveCredential(accounts, target.credentialRef);
      if (apiKey.length === 0 && target.provider.auth !== "none") {
        sendJson(res, 400, {
          error: `no credential for ${target.credentialRef}: store it with the accounts CLI (dsh-accounts set ${target.credentialRef}) or export it in the environment`,
        });
        return;
      }
      const overrides = {
        ...(typeof payload.voice === "string" && payload.voice.length > 0
          ? { voice: payload.voice }
          : {}),
        ...(typeof payload.speed === "number" && Number.isFinite(payload.speed)
          ? { speed: payload.speed }
          : {}),
        ...(typeof payload.format === "string" && payload.format.length > 0
          ? { format: payload.format }
          : {}),
      };
      const upstream = await synthesizeSpeech(target, apiKey, text, overrides);
      res.writeHead(200, {
        "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
        ...(upstream.headers.get("Content-Length") !== null
          ? { "Content-Length": upstream.headers.get("Content-Length") as string }
          : { "Transfer-Encoding": "chunked" }),
      });
      if (upstream.body === null) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
      else res.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

/**
 * POST /voice/api/stt — transcribe a raw recorded audio body through the
 * Whisper-compatible upstream. Used where the browser lacks SpeechRecognition
 * or the user picked the whisper engine.
 * @param current - live voice-config source.
 * @param accounts - the account vault seam for credential resolution.
 * @returns The webServer route handler.
 */
export function makeSttHandler(current: ConfigSource, accounts: AccountsLike | undefined) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (rejectNonPost(req, res)) return;
      const audio = await readBody(req);
      if (audio.length === 0) {
        sendJson(res, 400, { error: "empty audio body" });
        return;
      }
      const config = current();
      if (!config.stt.enabled) {
        sendJson(res, 403, { error: "STT is disabled (voice.stt.enabled)" });
        return;
      }
      const apiKey = await resolveCredential(accounts, config.stt.credentialRef);
      const contentType = req.headers["content-type"] ?? "audio/webm";
      const ext = contentType.includes("mp4")
        ? "m4a"
        : contentType.includes("mpeg")
          ? "mp3"
          : contentType.includes("ogg")
            ? "ogg"
            : contentType.includes("wav")
              ? "wav"
              : "webm";
      const result = await transcribeAudio(config.stt, apiKey, audio, `audio.${ext}`, "");
      sendJson(res, 200, result);
    } catch (err) {
      sendError(res, err);
    }
  };
}

/**
 * GET /voice/api/config — the non-secret slice the browser bundle composes
 * from: engine choices, auto-read, and the TTS voice picker data. Errors in
 * provider resolution surface as `providerError` so the settings UI can show
 * them instead of failing the page.
 * @param current - the voice-config source this handler reads per request.
 * @returns The webServer route handler.
 */
export function makeConfigHandler(current: ConfigSource) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    const config = current();
    let voices: { id: string; label: string }[] = [];
    let models: string[] = [];
    let providerError: string | null = null;
    try {
      const target = resolveTts(config.tts);
      voices = target.provider.voices;
      models = target.provider.models;
    } catch (err) {
      providerError = err instanceof Error ? err.message : String(err);
    }
    // The published picker data is read from the live user-choice references,
    // so the browser is answered with the values now committed, not the ones
    // this handler closure was built with.
    sendJson(res, 200, {
      tts: {
        enabled: config.tts.enabled.get(),
        provider: config.tts.provider.get(),
        model: config.tts.model.get(),
        voice: config.tts.voice.get(),
        speed: config.tts.speed.get(),
        format: config.tts.format.get(),
        voices,
        models,
        providerError,
      },
      providers: TTS_PROVIDERS.map((row) => ({ id: row.id, label: row.label })),
      stt: { enabled: config.stt.enabled, engine: config.stt.engine.get() },
      readAloud: { autoRead: config.readAloud.autoRead.get() },
    });
  };
}
