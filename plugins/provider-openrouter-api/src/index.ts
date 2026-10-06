/**
 * The `openrouter-api` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-openrouter-api
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import {
  API_KEY,
  CLAUDE_CONTEXT,
  CLAUDE_MAX_OUTPUT,
  OPENAI_DEFAULT_CONTEXT,
} from "@dsh-stack/providers";

/** The `openrouter-api` provider route. */
export const route: ProviderRoute = {
  id: "openrouter-api",
  displayName: "OpenRouter (API)",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://openrouter.ai/api/v1",
  authSlots: [API_KEY("OPENROUTER_API_KEY")],
  catalog: { url: "https://openrouter.ai/api/v1/models" },
  probe: { url: "https://openrouter.ai/api/v1/models" },
  models: [
    {
      id: "z-ai/glm-5.3-flash",
      name: "GLM 5.3 Flash",
      contextWindow: OPENAI_DEFAULT_CONTEXT,
      maxTokens: 16_000,
    },
    {
      id: "qwen/qwen-2.5-coder-32b-instruct",
      name: "Qwen 2.5 Coder 32B",
      contextWindow: OPENAI_DEFAULT_CONTEXT,
      maxTokens: 16_000,
    },
    {
      id: "openai/gpt-4o",
      name: "OpenAI GPT-4o",
      contextWindow: OPENAI_DEFAULT_CONTEXT,
      maxTokens: 16_000,
    },
    {
      id: "anthropic/claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      contextWindow: CLAUDE_CONTEXT,
      maxTokens: CLAUDE_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: 16_000,
  defaultContextWindow: OPENAI_DEFAULT_CONTEXT,
};

export const name = "provider-openrouter-api";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
