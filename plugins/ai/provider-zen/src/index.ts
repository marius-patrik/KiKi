/**
 * The `zen` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-zen
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";
import {
  API_KEY,
  CLAUDE_HAIKU_MODEL,
  DEEPSEEK_CONTEXT,
  DEEPSEEK_MAX_OUTPUT,
  EFFORTS,
  GEMINI_CONTEXT,
  GEMINI_MAX_OUTPUT,
  KIMI_CONTEXT,
  KIMI_K3_CONTEXT,
  KIMI_MAX_OUTPUT,
  ZEN_CLAUDE_CONTEXT,
  ZEN_CLAUDE_MAX_OUTPUT,
  ZEN_CONTEXT,
  ZEN_MAX_OUTPUT,
} from "@dsh-stack/providers";

/** The `zen` provider route. */
export const route: ProviderRoute = {
  id: "zen",
  displayName: "OpenCode Zen",
  kind: "api",
  authKind: "api-key",
  dialect: "openai",
  baseURL: "https://opencode.ai/zen/v1",
  authSlots: [API_KEY("ZEN_API_KEY")],
  catalog: { url: "https://opencode.ai/zen/v1/models" },
  // The listing answers 200 for a workspace with no payment method, while
  // every completion is refused — so probe with the smallest real completion.
  probe: {
    url: "https://opencode.ai/zen/v1/chat/completions",
    method: "POST",
    // A free-tier model: the route is usable without a funded workspace, and
    // probing a paid model would report the whole provider as unavailable
    // over a billing state that only affects part of its catalog.
    body: JSON.stringify({
      model: "deepseek-v4-flash-free",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  },
  models: [
    // OpenAI family — /v1/chat/completions (universal endpoint)
    {
      id: "gpt-5.6-sol",
      name: "GPT 5.6 Sol",
      contextWindow: 272_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT 5.6 Terra",
      contextWindow: 272_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT 5.6 Luna",
      contextWindow: 272_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gpt-5.5",
      name: "GPT 5.5",
      contextWindow: 272_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gpt-5.4",
      name: "GPT 5.4",
      contextWindow: 272_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gpt-5.3-codex",
      name: "GPT 5.3 Codex",
      contextWindow: 272_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    // Claude family
    {
      id: "claude-opus-5",
      name: "Claude Opus 5",
      contextWindow: ZEN_CLAUDE_CONTEXT,
      maxTokens: ZEN_CLAUDE_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      contextWindow: ZEN_CLAUDE_CONTEXT,
      maxTokens: ZEN_CLAUDE_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      contextWindow: ZEN_CLAUDE_CONTEXT,
      maxTokens: ZEN_CLAUDE_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      contextWindow: ZEN_CLAUDE_CONTEXT,
      maxTokens: ZEN_CLAUDE_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    CLAUDE_HAIKU_MODEL,
    // Gemini family
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gemini-3.6-flash",
      name: "Gemini 3.6 Flash",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      contextWindow: GEMINI_CONTEXT,
      maxTokens: GEMINI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    // Grok family
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      contextWindow: 200_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "grok-4.5",
      name: "Grok 4.5",
      contextWindow: 200_000,
      maxTokens: ZEN_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    // DeepSeek family
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      contextWindow: DEEPSEEK_CONTEXT,
      maxTokens: DEEPSEEK_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      contextWindow: DEEPSEEK_CONTEXT,
      maxTokens: DEEPSEEK_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    // Kimi family
    {
      id: "kimi-k3",
      name: "Kimi K3",
      contextWindow: KIMI_K3_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      contextWindow: KIMI_CONTEXT,
      maxTokens: KIMI_MAX_OUTPUT,
      reasoning: EFFORTS,
    },
    // Qwen family
    {
      id: "qwen3.7-max",
      name: "Qwen 3.7 Max",
      contextWindow: ZEN_CONTEXT,
      maxTokens: ZEN_MAX_OUTPUT,
    },
    {
      id: "qwen3.7-plus",
      name: "Qwen 3.7 Plus",
      contextWindow: ZEN_CONTEXT,
      maxTokens: ZEN_MAX_OUTPUT,
    },
    // Free tier
    {
      id: "deepseek-v4-flash-free",
      name: "DeepSeek V4 Flash (Free)",
      contextWindow: DEEPSEEK_CONTEXT,
      maxTokens: DEEPSEEK_MAX_OUTPUT,
    },
    {
      id: "mimo-v2.5-free",
      name: "MiMo-V2.5 (Free)",
      contextWindow: ZEN_CONTEXT,
      maxTokens: ZEN_MAX_OUTPUT,
    },
  ],
  defaultMaxTokens: ZEN_MAX_OUTPUT,
  defaultContextWindow: ZEN_CONTEXT,
};

export const name = "provider-zen";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
