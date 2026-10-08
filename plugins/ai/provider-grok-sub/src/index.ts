/**
 * The `grok-sub` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-grok-sub
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { EFFORTS, HEADERS, TOKEN, XAI_CONTEXT, XAI_MAX_OUTPUT } from "@dsh-stack/providers";

/** The `grok-sub` provider route. */
export const route: ProviderRoute = {
  id: "grok-sub",
  displayName: "Grok (Subscription)",
  kind: "subscription",
  authKind: "oauth",
  dialect: "openai",
  baseURL: "https://cli-chat-proxy.grok.com/v1",
  headers: HEADERS({
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-identifier": "grok-shell",
    "x-grok-client-version": "0.2.93",
  }),
  authSlots: [TOKEN("GROK_SUB_OAUTH_TOKEN")],
  catalog: { url: "https://cli-chat-proxy.grok.com/v1/models" },
  probe: { url: "https://cli-chat-proxy.grok.com/v1/models" },
  models: [
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      contextWindow: XAI_CONTEXT,
      maxTokens: XAI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "grok-4.5",
      name: "Grok 4.5",
      contextWindow: XAI_CONTEXT,
      maxTokens: XAI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "grok-composer-2.5-fast",
      name: "Grok Composer 2.5 Fast",
      contextWindow: XAI_CONTEXT,
      maxTokens: XAI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
  ],
  defaultMaxTokens: XAI_MAX_OUTPUT,
  defaultContextWindow: XAI_CONTEXT,
};

export const name = "provider-grok-sub";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
