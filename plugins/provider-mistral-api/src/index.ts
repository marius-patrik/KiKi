/**
 * The `mistral-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-mistral-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, MISTRAL_CONTEXT, MISTRAL_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `mistral-api` provider route. */
export const route: ProviderRoute = {
  id: "mistral-api",
  displayName: "Mistral (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.mistral.ai/v1",
  authSlots: [API_KEY("MISTRAL_API_KEY")],
  catalog: { url: "https://api.mistral.ai/v1/models" },
  probe: { url: "https://api.mistral.ai/v1/models" },
  models: [
    {
      id: "mistral-large-latest",
      name: "Mistral Large",
      contextWindow: MISTRAL_CONTEXT,
      maxTokens: MISTRAL_MAX_OUTPUT,
    },
    {
      id: "mistral-medium-latest",
      name: "Mistral Medium",
      contextWindow: MISTRAL_CONTEXT,
      maxTokens: MISTRAL_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: MISTRAL_MAX_OUTPUT,
  defaultContextWindow: MISTRAL_CONTEXT,
};

export const name = "provider-mistral-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
