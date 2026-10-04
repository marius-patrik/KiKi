/**
 * The `zai-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-zai-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { API_KEY, ZAI_CONTEXT, ZAI_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `zai-api` provider route. */
export const route: ProviderRoute = {
  id: "zai-api",
  displayName: "Z.ai (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://api.z.ai/api/coding/paas/v4",
  authSlots: [API_KEY("ZAI_API_KEY")],
  catalog: { url: "https://api.z.ai/api/coding/paas/v4/models" },
  probe: { url: "https://api.z.ai/api/coding/paas/v4/models" },
  models: [
    {
      id: "glm-5.3-flash",
      name: "GLM 5.3 Flash",
      contextWindow: ZAI_CONTEXT,
      maxTokens: ZAI_MAX_OUTPUT,
    },
    {
      id: "glm-5.3",
      name: "GLM 5.3",
      contextWindow: ZAI_CONTEXT,
      maxTokens: ZAI_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: ZAI_MAX_OUTPUT,
  defaultContextWindow: ZAI_CONTEXT,
};

export const name = "provider-zai-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
