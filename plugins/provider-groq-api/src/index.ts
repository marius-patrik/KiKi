/**
 * The `groq-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-groq-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, GROQ_CONTEXT, GROQ_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `groq-api` provider route. */
export const route: ProviderRoute = {
  id: "groq-api",
  displayName: "Groq (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.groq.com/openai/v1",
  authSlots: [API_KEY("GROQ_API_KEY")],
  catalog: { url: "https://api.groq.com/openai/v1/models" },
  probe: { url: "https://api.groq.com/openai/v1/models" },
  models: [
    {
      id: "qwen/qwen3.8-27b",
      name: "Qwen 3.8 27B",
      contextWindow: GROQ_CONTEXT,
      maxTokens: GROQ_MAX_OUTPUT,
    },
    {
      id: "openai/gpt-oss-120b",
      name: "GPT-OSS 120B",
      contextWindow: GROQ_CONTEXT,
      maxTokens: GROQ_MAX_OUTPUT,
    },
    {
      id: "qwen/qwen3.6-27b",
      name: "Qwen 3.6 27B",
      contextWindow: GROQ_CONTEXT,
      maxTokens: GROQ_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: GROQ_MAX_OUTPUT,
  defaultContextWindow: GROQ_CONTEXT,
};

export const name = "provider-groq-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
