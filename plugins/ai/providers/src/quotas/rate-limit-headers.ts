/**
 * Generic `x-ratelimit-*`/`retry-after` header parsing shared by every probe
 * that reads a plain HTTP response: the built-in provider probes and the
 * configured-route probes for providers this plugin does not own (custom
 * OpenAI-compatible gateways, including numbered multi-account routes like
 * `openrouter-2`). Anthropic's own header family
 * (`anthropic-ratelimit-tokens-*`) is vendor-specific and stays with the
 * built-in probe that already knows it is talking to Anthropic.
 * @module providers/quotas/rate-limit-headers
 */

import type { QuotaSnapshot } from "./index.js";

/** Read one numeric response header, or undefined when absent or non-numeric. */
export function parseRateLimitHeaderNumber(res: Response, name: string): number | undefined {
  const val = res.headers.get(name);
  if (!val) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The reset time a rate-limited or healthy response names, from either
 * `x-ratelimit-reset` (a unix timestamp, seconds or milliseconds) or
 * `retry-after` (a relative second count), as an ISO string.
 */
export function parseRateLimitReset(res: Response): string | undefined {
  const reset = res.headers.get("x-ratelimit-reset");
  if (reset) {
    const ts = Number(reset);
    if (Number.isFinite(ts)) return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
  }
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return new Date(Date.now() + seconds * 1000).toISOString();
  }
  return undefined;
}

/** Build the rate-limit fields shared by the healthy and rate-limited snapshot branches. */
export function rateLimitFields(
  remaining: number | undefined,
  limit: number | undefined,
  resetsAt: string | undefined,
): Pick<QuotaSnapshot, "remaining" | "limit" | "resetsAt"> {
  return {
    ...(remaining !== undefined ? { remaining } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}
