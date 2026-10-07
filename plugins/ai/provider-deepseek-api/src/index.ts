/**
 * The `deepseek-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-deepseek-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, DEEPSEEK_CONTEXT, DEEPSEEK_MAX_OUTPUT, EFFORTS } from "@dsh-stack/providers";

/** The `deepseek-api` provider route. */
export const route: ProviderRoute = {
  id: "deepseek-api",
  displayName: "DeepSeek (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.deepseek.com/v1",
  authSlots: [API_KEY("DEEPSEEK_API_KEY")],
  catalog: { url: "https://api.deepseek.com/v1/models" },
  probe: { url: "https://api.deepseek.com/v1/models" },
  models: [
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      contextWindow: DEEPSEEK_CONTEXT,
      maxTokens: DEEPSEEK_MAX_OUTPUT,
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      contextWindow: DEEPSEEK_CONTEXT,
      maxTokens: DEEPSEEK_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
  ],
  defaultMaxTokens: DEEPSEEK_MAX_OUTPUT,
  defaultContextWindow: DEEPSEEK_CONTEXT,
};

export const name = "provider-deepseek-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
