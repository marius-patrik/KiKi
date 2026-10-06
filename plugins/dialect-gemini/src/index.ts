/**
 * dialect-gemini: shared Google Gemini wire-format serialization helpers.
 * No provider route resolves a `gemini` id through `ctx.dialects.get()` --
 * both Gemini providers use a different route instead (`provider-gemini-api`
 * is `dialect: "openai"`, Google's OpenAI-compatible endpoint;
 * `provider-gemini-sub` is `dialect: "code-assist"`, a JSON wrapper over this
 * same vocabulary). `@dsh-stack/dialect-code-assist` depends on this
 * package's serialization helpers for that wrapper, which is this package's
 * only real consumer today (dsh-stack#194) -- this is a plain library, not a
 * mountable cordis extension.
 *
 * @module dialect-gemini
 */

export { geminiDialect, serializeContents, buildToolNameIndex } from "./gemini.js";
export type { WireContent } from "./gemini.js";
export { translateGemini, mapGeminiFinishReason } from "./translate-gemini.js";
