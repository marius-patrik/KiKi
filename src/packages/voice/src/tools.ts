/**
 * Agent-facing tools: `voice_speak` renders text through the same neural TTS
 * the browser read-aloud uses and writes the audio into the workspace, and
 * `voice_transcribe` turns an audio file into text through the
 * Whisper-compatible upstream. Both resolve credentials per call from the
 * account vault, so the model never sees a key.
 * @module voice/tools
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { resolveTts } from "./providers.js";
import {
  resolveCredential,
  synthesizeSpeech,
  transcribeAudio,
  type AccountsLike,
} from "./speech.js";
import type { VoiceConfig } from "./config.js";

/** The tool registry slice of the plugin context. */
export interface ToolRegistry {
  register(definition: unknown): () => void;
}

/**
 * Register both voice tools against the harness tool registry.
 * @param tools - the harness tool registry (`ctx.tools`).
 * @param current - live voice-config source.
 * @param accounts - the account vault seam for credential resolution.
 * @returns Nothing; registrations ride the caller's fiber.
 */
export function registerVoiceTools(
  tools: ToolRegistry,
  current: () => VoiceConfig,
  accounts: AccountsLike | undefined,
): void {
  tools.register(
    defineTool({
      name: "voice_speak",
      description:
        "Generate natural, human-sounding spoken audio from text via the configured neural TTS endpoint (OpenAI-compatible /audio/speech, e.g. gpt-4o-mini-tts with voices like nova or shimmer). Writes the audio file into the workspace and returns its path.",
      parameters: {
        text: {
          type: "string",
          required: true,
          description: "Text to synthesize into speech.",
        },
        outPath: {
          type: "string",
          description: "Optional absolute output path (default: <cwd>/voice-<timestamp>.<format>).",
        },
        voice: {
          type: "string",
          description: "Optional voice override (e.g. nova, shimmer, alloy).",
        },
        speed: {
          type: "number",
          description: "Optional speed override (0.25–4.0, default from settings).",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: {
              type: "string",
              required: true,
              description: "Absolute path of the written audio file.",
            },
            bytes: { type: "integer", required: true, description: "Bytes written." },
            voice: { type: "string", required: true, description: "Voice used." },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `Generated speech: ${value.path} (${value.bytes} bytes, voice ${value.voice})`,
          },
        ],
      },
      /**
       * Executes text-to-speech synthesis using the provided configuration and arguments.
       *
       * Throws an error if TTS is disabled or if a required credential is missing.
       * Returns the path to the saved audio file and its byte size.
       */
      async execute(args) {
        const config = current();
        // `tts.enabled` is a volatile user choice, so it is read through its
        // reference: a `Volatile` object is always truthy, so a missing `.get()`
        // would silently turn this guard into dead code.
        if (!config.tts.enabled.get()) throw new Error("TTS is disabled (voice.tts.enabled)");
        const target = resolveTts(config.tts);
        const apiKey = await resolveCredential(accounts, target.credentialRef);
        if (apiKey.length === 0 && target.provider.auth !== "none") {
          throw new Error(
            `voice_speak needs a credential: store ${target.credentialRef} in the dsh account vault (or export it in the environment), or point voice.tts at a keyless local endpoint`,
          );
        }
        const overrides = {
          ...(args.voice !== undefined ? { voice: args.voice } : {}),
          ...(args.speed !== undefined ? { speed: args.speed } : {}),
        };
        const upstream = await synthesizeSpeech(target, apiKey, args.text, overrides);
        const audio = Buffer.from(await upstream.arrayBuffer());
        const format = target.format;
        const out =
          args.outPath !== undefined
            ? resolve(args.outPath)
            : resolve(process.cwd(), `voice-${Date.now()}.${format}`);
        await writeFile(out, audio);
        return { path: out, bytes: audio.length, voice: overrides.voice ?? target.voice };
      },
    }),
  );

  tools.register(
    defineTool({
      name: "voice_transcribe",
      description:
        "Transcribe an audio file (wav/mp3/m4a/ogg/webm/flac) to text via a Whisper-compatible /audio/transcriptions endpoint. Lets a text-only model hear recordings the user attaches.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path to the audio file to transcribe.",
        },
        language: {
          type: "string",
          description:
            "Optional language hint (ISO-639-1, e.g. zh, en). Leave empty to auto-detect.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string", required: true, description: "Transcribed text." },
            language: { type: "string", description: "Detected / used language." },
          },
        },
        render: (_args, value) => [{ type: "text", text: value.text }],
      },
      /** execute implementation. */
      async execute(args) {
        const config = current();
        if (!config.stt.enabled) throw new Error("STT is disabled (voice.stt.enabled)");
        const audio = await readFile(resolve(args.path));
        const apiKey = await resolveCredential(accounts, config.stt.credentialRef);
        const filename = args.path.split("/").pop() ?? "audio.webm";
        return transcribeAudio(config.stt, apiKey, audio, filename, args.language ?? "");
      },
    }),
  );
}
