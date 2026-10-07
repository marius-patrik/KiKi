/**
 * The `openai-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-openai-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, EFFORTS, OPENAI_DEFAULT_CONTEXT, OPENAI_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `openai-api` provider route. */
export const route: ProviderRoute = {
  id: "openai-api",
  displayName: "OpenAI (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.openai.com/v1",
  authSlots: [API_KEY("OPENAI_API_KEY")],
  catalog: { url: "https://api.openai.com/v1/models" },
  probe: { url: "https://api.openai.com/v1/models" },
  models: [
    {
      id: "gpt-5",
      name: "GPT-5",
      contextWindow: 400_000,
      maxTokens: OPENAI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    { id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1_000_000, maxTokens: 32_000 },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o mini",
      contextWindow: OPENAI_DEFAULT_CONTEXT,
      maxTokens: 16_000,
    },
  ],
  defaultMaxTokens: 16_000,
  defaultContextWindow: OPENAI_DEFAULT_CONTEXT,
};

export const name = "provider-openai-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
