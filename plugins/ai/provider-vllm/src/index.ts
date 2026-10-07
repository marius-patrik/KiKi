/**
 * The `vllm` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-vllm
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";

/** The `vllm` provider route. */
export const route: ProviderRoute = {
  id: "vllm",
  displayName: "vLLM (Local)",
  kind: "local",
  authKind: "none",
  dialect: "openai",
  baseURL: "http://127.0.0.1:8000/v1",
  authSlots: [],
  catalog: { url: "http://127.0.0.1:8000/v1/models" },
  probe: { url: "http://127.0.0.1:8000/v1/models" },
  models: [],
  defaultMaxTokens: 16_384,
  defaultContextWindow: 131_072,
};

export const name = "provider-vllm";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
