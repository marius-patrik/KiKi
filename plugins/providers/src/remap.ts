/**
 * Agent-scoped remap: steer requests that landed on a disabled provider to a
 * configured subscription default.
 *
 * Mounted from a preset row (`presets/subscriptions/agent.cordis.yml`), this
 * plugin runs on the standing agent scope, where `agent/request` fires. It
 * transforms the value `next()` returns, so it observes the request exactly as
 * the agent machine will dispatch it — after the model-selection listener on
 * the inner agent context applied the session's provider/model choice.
 *
 * Only providers the `providers` filter hides from the catalog
 * (`visible: false`) are remapped; a provider that fails visibly
 * (`MISSING_CREDENTIAL`) is left to fail loud so the operator logs in instead
 * of silently running on another seat. Providers outside the filter
 * (e.g. `deepseek-official`) pass through untouched.
 *
 * Merged from the standalone dsh-subscriptions package; the plugin name stays
 * `subscription-remap` so existing preset rows keep resolving.
 * @module providers/remap
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
// NOTE: no explicit dsh-llm type import — the listener signature is inferred
// from the dsh-agent event augmentation so a duplicate dsh-llm copy in the
// resolution graph cannot fork the LlmCallConfig brand.
import type {} from "@deepseek-ai/dsh-agent";

/** Stable Cordis plugin name. */
export const name = "subscription-remap";

/** Core services required before the remap can route. */
export const inject: never[] = [];

/** Plugin config: the single-seat route every disabled provider is steered to. */
export interface Config {
  /** The subscription default route requests are remapped to. */
  default: {
    /** A provider id known to the harness at request time. */
    provider: string;
    /** A model id owned by the provider above. */
    model: string;
  };
}

export const Config: z<Config> = z.object({
  default: z.object({
    provider: z.string().required(),
    model: z.string().required(),
  }),
});

/**
 * Mount the remap listener.
 * @param ctx - the standing agent scope the preset composed into.
 * @param config - validated remap config.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on("agent/request", async (_payload, next) => {
    const resolved = await next();
    const policy = ctx.get("dshProviders");
    if (policy === undefined) return resolved;
    const gate = await policy.gate(resolved.provider);
    if (gate === undefined || gate.visible) return resolved;
    ctx.logger.info(
      `subscription-remap: ${resolved.provider}/${resolved.model} is disabled (${gate.reason.code}); ` +
        `routing to ${config.default.provider}/${config.default.model}`,
    );
    return { ...resolved, provider: config.default.provider, model: config.default.model };
  });
}
