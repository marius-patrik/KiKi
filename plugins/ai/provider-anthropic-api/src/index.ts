/**
 * The `anthropic-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-anthropic-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import {
  API_KEY,
  CLAUDE_CONTEXT,
  CLAUDE_HAIKU_MODEL,
  CLAUDE_MAX_OUTPUT,
  EFFORTS,
} from "@dsh-stack/providers";

/** The `anthropic-api` provider route. */
export const route: ProviderRoute = {
  id: "anthropic-api",
  displayName: "Anthropic (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "claude",
  baseURL: "https://api.anthropic.com/v1",
  authSlots: [API_KEY("ANTHROPIC_API_KEY")],
  catalog: { url: "https://api.anthropic.com/v1/models", authStyle: "x-api-key" },
  probe: { url: "https://api.anthropic.com/v1/models", authStyle: "x-api-key" },
  models: [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      contextWindow: CLAUDE_CONTEXT,
      maxTokens: CLAUDE_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "claude-opus-4-1",
      name: "Claude Opus 4.1",
      contextWindow: CLAUDE_CONTEXT,
      maxTokens: CLAUDE_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    CLAUDE_HAIKU_MODEL,
  ],
  defaultMaxTokens: CLAUDE_MAX_OUTPUT,
  defaultContextWindow: CLAUDE_CONTEXT,
};

export const name = "provider-anthropic-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
