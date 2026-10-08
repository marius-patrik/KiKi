/**
 * The `gemini-sub` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-gemini-sub
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import { EFFORTS, GEMINI_CONTEXT, GEMINI_MAX_OUTPUT, TOKEN } from "@dsh-stack/providers";

/** The `gemini-sub` provider route. */
export const route: ProviderRoute = {
  id: "gemini-sub",
  // Not the subscription: this is Google's free Code Assist tier, the surface
  // the Gemini CLI uses. The paid Antigravity seat on the same account is
  // `antigravity-sub`, and the pay-as-you-go Google API is `gemini-api`, so
  // all three are named for what they actually bill.
  displayName: "Gemini Code Assist (Free tier)",
  kind: "subscription",
  authKind: "oauth",
  dialect: "code-assist",
  baseURL: "https://cloudcode-pa.googleapis.com/v1internal",
  authSlots: [TOKEN("GEMINI_SUB_OAUTH_TOKEN")],
  // loadCodeAssist answers 200 for an account whose generation quota is
  // exhausted, so probing it reported this route healthy while every
  // message came back 429. The smallest real generation is the only
  // request that answers the question the light claims to answer.
  probe: {
    url: "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
    method: "POST",
    // The same identity headers the code-assist dialect sends per request;
    // Code Assist answers 500 rather than a status when they are absent.
    headers: {
      accept: "text/event-stream",
      "x-goog-api-client": "gl-node",
      "user-agent": "Antigravity/2.0.1 (Jetbrains; DARWIN_ARM64)",
    },
    body: JSON.stringify({
      model: "gemini-3.6-flash",
      project: "",
      user_prompt_id: "00000000-0000-4000-8000-000000000000",
      request: {
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1 },
        session_id: "00000000-0000-4000-8000-000000000000",
      },
    }),
  },
  models: [
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: GEMINI_MAX_OUTPUT,
  defaultContextWindow: GEMINI_CONTEXT,
};

export const name = "provider-gemini-sub";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
