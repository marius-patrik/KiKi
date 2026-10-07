/**
 * The `kimi-sub` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-kimi-sub
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { KIMI_CONTEXT, KIMI_MAX_OUTPUT, TOKEN, kimiCoreModels } from "@dsh-stack/providers";

/** The `kimi-sub` provider route. */
export const route: ProviderRoute = {
  id: "kimi-sub",
  displayName: "Kimi Code (Subscription)",
  kind: "subscription",
  authKind: "oauth",
  dialect: "openai",
  baseURL: "https://api.kimi.com/coding/v1",
  authSlots: [TOKEN("KIMI_SUB_OAUTH_TOKEN")],
  catalog: { url: "https://api.kimi.com/coding/v1/models" },
  // The catalog endpoint answers 200 on an exhausted plan, so probing it
  // reports "healthy" while every completion 403s. A one-token completion is
  // the smallest request that actually exercises the quota the panel claims
  // to be reporting.
  probe: {
    url: "https://api.kimi.com/coding/v1/chat/completions",
    method: "POST",
    body: JSON.stringify({
      model: "kimi-k3",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  },
  models: kimiCoreModels(),
  defaultMaxTokens: KIMI_MAX_OUTPUT,
  defaultContextWindow: KIMI_CONTEXT,
};

export const name = "provider-kimi-sub";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
