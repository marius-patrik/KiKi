/**
 * The `grok-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-grok-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, EFFORTS, XAI_CONTEXT, XAI_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `grok-api` provider route. */
export const route: ProviderRoute = {
  id: "grok-api",
  displayName: "Grok (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.x.ai/v1",
  authSlots: [API_KEY("XAI_API_KEY")],
  catalog: { url: "https://api.x.ai/v1/models" },
  probe: { url: "https://api.x.ai/v1/models" },
  models: [
    {
      id: "grok-4",
      name: "Grok 4",
      contextWindow: XAI_CONTEXT,
      maxTokens: XAI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "grok-code-fast-1",
      name: "Grok Code Fast",
      contextWindow: XAI_CONTEXT,
      maxTokens: XAI_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: XAI_MAX_OUTPUT,
  defaultContextWindow: XAI_CONTEXT,
};

export const name = "provider-grok-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
