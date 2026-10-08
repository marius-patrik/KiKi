/**
 * The `cerebras-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-cerebras-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, CEREBRAS_CONTEXT, CEREBRAS_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `cerebras-api` provider route. */
export const route: ProviderRoute = {
  id: "cerebras-api",
  displayName: "Cerebras (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.cerebras.ai/v1",
  authSlots: [API_KEY("CEREBRAS_API_KEY")],
  catalog: { url: "https://api.cerebras.ai/v1/models" },
  probe: { url: "https://api.cerebras.ai/v1/models" },
  models: [
    {
      id: "llama-4-scout-17b-16e",
      name: "Llama 4 Scout",
      contextWindow: CEREBRAS_CONTEXT,
      maxTokens: CEREBRAS_MAX_OUTPUT,
    },
    {
      id: "llama-4-maverick-17b-128e",
      name: "Llama 4 Maverick",
      contextWindow: CEREBRAS_CONTEXT,
      maxTokens: CEREBRAS_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: CEREBRAS_MAX_OUTPUT,
  defaultContextWindow: CEREBRAS_CONTEXT,
};

export const name = "provider-cerebras-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
