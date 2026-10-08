/**
 * The `ollama` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-ollama
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";

/** The `ollama` provider route. */
export const route: ProviderRoute = {
  id: "ollama",
  displayName: "Ollama (Local)",
  kind: "local",
  authKind: "none",
  dialect: "openai",
  baseURL: "http://127.0.0.1:11434/v1",
  authSlots: [],
  catalog: { url: "http://127.0.0.1:11434/v1/models" },
  probe: { url: "http://127.0.0.1:11434/api/tags" },
  models: [{ id: "qwen3.8:27b", name: "Qwen 3.8 27B", contextWindow: 131_072, maxTokens: 16_384 }],
  defaultMaxTokens: 16_384,
  defaultContextWindow: 131_072,
};

export const name = "provider-ollama";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
