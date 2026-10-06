/**
 * The `kimi-code` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-kimi-code
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import {
  API_KEY,
  EFFORTS,
  KIMI_CONTEXT,
  KIMI_MAX_OUTPUT,
  kimiCoreModels,
} from "@dsh-stack/providers";

/** The `kimi-code` provider route. */
export const route: ProviderRoute = {
  id: "kimi-code",
  displayName: "Kimi Code (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.kimi.com/coding/v1",
  authSlots: [API_KEY("KIMI_API_KEY")],
  catalog: { url: "https://api.kimi.com/coding/v1/models" },
  // Same endpoint as the subscription route, and the API key resolves the
  // same catalog, so the two advertise the same models rather than pinning
  // this one to an older generation.
  models: [
    ...kimiCoreModels(),
    {
      id: "kimi-k2.5-thinking",
      name: "Kimi K2.5 Thinking",
      contextWindow: KIMI_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
  ],
  defaultMaxTokens: KIMI_MAX_OUTPUT,
  defaultContextWindow: KIMI_CONTEXT,
};

export const name = "provider-kimi-code";
export const inject = ["providers"];

/**
 * Registers the route with the context's providers.
 *
 * @param ctx - The context containing providers to register the route with.
 */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
