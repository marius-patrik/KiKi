/**
 * The `llamacpp` provider route: a concrete provider extension plugging into
 * the `providers` registry abstraction (`@dsh-stack/providers`).
 * @module provider-llamacpp
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ProviderRoute } from "@dsh-stack/providers";

/** The `llamacpp` provider route. */
export const route: ProviderRoute = {
  id: "llamacpp",
  displayName: "llama.cpp (Local)",
  kind: "local",
  authKind: "none",
  dialect: "openai",
  baseURL: "http://127.0.0.1:8080/v1",
  authSlots: [],
  catalog: { url: "http://127.0.0.1:8080/v1/models" },
  probe: { url: "http://127.0.0.1:8080/v1/models" },
  models: [],
  defaultMaxTokens: 16_384,
  defaultContextWindow: 131_072,
};

export const name = "provider-llamacpp";
export const inject = ["providers"];

/** apply implementation. */
export function apply(ctx: Context): void {
  ctx.providers.register(route);
}
