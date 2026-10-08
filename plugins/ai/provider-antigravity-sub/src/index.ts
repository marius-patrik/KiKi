/**
 * The `antigravity-sub` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-antigravity-sub
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { EFFORTS, HEADER, TOKEN } from "@dsh-stack/providers";
import { ANTIGRAVITY_PROJECT_HEADER } from "@dsh-stack/dialect-antigravity";

/** The `antigravity-sub` provider route. */
export const route: ProviderRoute = {
  id: "antigravity-sub",
  displayName: "Antigravity (Subscription)",
  kind: "subscription",
  authKind: "oauth",
  dialect: "antigravity",
  baseURL: "https://cloudcode-pa.googleapis.com/v1internal",
  // Same account and token as gemini-sub, a different product on it. The
  // Gemini/Google Cloud API reaches the same model families on a different
  // quota, which is why this is named for Antigravity rather than Gemini.
  authSlots: [
    TOKEN("GEMINI_SUB_OAUTH_TOKEN"),
    HEADER(ANTIGRAVITY_PROJECT_HEADER, "ANTIGRAVITY_PROJECT"),
  ],
  // The one request that exercises the subscription pool rather than the
  // free Code Assist tier gemini-sub is stuck behind.
  probe: {
    url: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
    method: "POST",
    body: "{}",
    headers: {
      "x-goog-api-client": "gl-node",
      "user-agent": "Antigravity/2.0.1 (Jetbrains; DARWIN_ARM64)",
    },
  },
  // The backend picks the model (see ANTIGRAVITY.md: every published
  // modelConfigId is refused), so the route advertises the one it serves.
  models: [
    {
      id: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      contextWindow: 1_048_576,
      maxTokens: 65_535,
      reasoning: EFFORTS,
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      contextWindow: 1_048_576,
      maxTokens: 65_535,
      reasoning: EFFORTS,
    },
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      contextWindow: 1_048_576,
      maxTokens: 65_535,
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      contextWindow: 1_048_576,
      maxTokens: 65_535,
      reasoning: EFFORTS,
    },
  ],
  defaultMaxTokens: 65_535,
  defaultContextWindow: 1_048_576,
};

export const name = "provider-antigravity-sub";
export const inject = ["providers"];

/**
 * Registers the route with the given context's providers.
 *
 * @param ctx - The context containing providers to register the route with.
 */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
