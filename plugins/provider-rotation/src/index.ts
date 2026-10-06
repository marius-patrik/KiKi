/**
 * provider-rotation: automatic same-vendor account failover for `ctx.llm`
 * routes, closing the gap #209 could not reach.
 *
 * `@dsh-stack/providers`' own DialectAdapter routes never fork per-account
 * (each Stack `provider-<id>` extension registers exactly one route per
 * vendor), and the numbered multi-account routes real dispatch traffic hits
 * (`openrouter`, `openrouter-2`, ...) are registered by harness's own
 * `llm-pi-ai` package from the `.data/settings.yaml` `providers.custom`
 * section -- a harness-pinned package this repo cannot modify.
 *
 * This plugin needs no access to llm-pi-ai's internals: `ctx.llm` is a
 * plain, provider-agnostic registry (`registerAdapter`/`listProviders`/
 * `stream` are public regardless of which plugin registered a route), so a
 * Stack-owned adapter can sit entirely outside it. On boot, and again on
 * every `llm/adapters-updated` event, it groups every currently registered
 * provider id by vendor (stripping a trailing `-<N>` suffix -- the same
 * numbered-account convention `.data/settings.yaml` already uses across
 * every multi-account vendor), and registers one new `<vendor>-pool`
 * adapter per vendor with two or more accounts. That adapter's `stream()`
 * tries each member in order, failing over to the next on a rate-limit or
 * quota/balance-exhaustion error that struck before any real content
 * reached the caller, by re-entrantly calling `ctx.llm.stream()` for each
 * candidate -- so it dispatches through the *same* adapters (llm-pi-ai's
 * `openrouter`, `openrouter-2`, ...) real requests already use, gaining
 * nothing but the failover.
 *
 * This is purely additive: every existing provider id (`openrouter`,
 * `z-ai`, ...) keeps behaving exactly as before. To use rotation, point
 * `agent-default-model.provider` (or a session's configured provider) at
 * the pool id instead, e.g. `openrouter-pool`.
 * @module provider-rotation
 */

import type { Context } from "@deepseek-ai/cordis";
import { LlmAdapter, LlmError } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { vendorBaseId, vendorSuffix } from "@dsh-stack/providers";

/** {@link LlmError.code} values a same-vendor sibling account can plausibly avoid. */
const ROTATABLE_CODES: ReadonlySet<string> = new Set(["QUOTA", "RATE_LIMIT"]);

/**
 * `harness/packages/llm/llm-pi-ai`'s classifier (`classifyPiAiError`, pinned,
 * cannot be edited) is purely message-text-based -- the underlying `pi-ai`
 * dependency discards the real HTTP status before it reaches harness -- and
 * has no case for OpenRouter's actual 402 wordings ("requires more credits",
 * "Prompt tokens limit exceeded", "would exceed your available credits",
 * "in_flight_budget_exhausted"), so every one of them falls through to the
 * generic `PI_AI_ERROR` catch-all code, observed directly against real
 * exhausted accounts this session. Matching on message text here, scoped to
 * these specific confirmed wordings rather than the whole `PI_AI_ERROR`
 * bucket, keeps rotation from masking a genuinely different failure (a bad
 * request, an unknown model) that also happens to fall into that same
 * catch-all code.
 */
const PI_AI_QUOTA_WORDING =
  /requires more credits|prompt tokens limit exceeded|exceed(?:s|ed)? your available credits|in.?flight.?budget.?exhausted/i;

/** Whether a failure (thrown `LlmError`, or an `LlmFailure` carried on a `finish` chunk) is a same-vendor-rotatable one. */
function isRotatable(failure: { code: string; message: string }): boolean {
  if (ROTATABLE_CODES.has(failure.code)) return true;
  return failure.code === "PI_AI_ERROR" && PI_AI_QUOTA_WORDING.test(failure.message);
}

/**
 * Streams a request against `members[0]`, failing over to the next member
 * on a rate-limit or quota-exhaustion error that struck before any real
 * content reached the caller, by re-entrantly calling `ctx.llm.stream()`
 * for each candidate. A failure after partial output never rotates: the
 * caller already has content attributed to the first account, and a fresh
 * attempt from a sibling would answer the same prompt twice.
 */
export class PoolAdapter extends LlmAdapter {
  /** @param members Ordered account ids to try, first to last. */
  constructor(
    private readonly ctx: Context,
    private readonly members: readonly string[],
  ) {
    super();
  }

  /** Streams the request, rotating through {@link members} on a rotatable pre-content failure. */
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    for (let index = 0; index < this.members.length; index++) {
      const provider = this.members[index]!;
      const nextProvider = this.members[index + 1];
      // Buffered, not passed straight through: an adapter may emit
      // structural scaffolding (block-start, usage, ...) even around a
      // request that still ultimately fails before any real content, and a
      // chunk already forwarded to the caller can never be un-sent if
      // rotation then discards this attempt entirely. Everything buffered
      // here is either flushed (first real content chunk, or a stream that
      // reaches its own natural end) or discarded whole (a rotatable
      // failure with no content chunk seen yet).
      const buffered: StreamChunk[] = [];
      let sawContent = false;
      // A failure normally never throws: LlmRuntime converts a caught adapter
      // error into a terminal `finish` chunk with an error/aborted reason
      // (see adapterFailureChunk in harness's llm package) rather than
      // rejecting the iteration -- `failureChunk` carries that chunk so a
      // decision not to rotate can forward it unchanged, reason (error vs
      // aborted) and all. A thrown exception is also handled, for any
      // adapter that rejects instead of yielding a terminal chunk.
      let failureChunk: Extract<StreamChunk, { type: "finish" }> | undefined;
      let thrown: unknown;
      try {
        for await (const chunk of this.ctx.llm.stream({ ...options, provider })) {
          if (
            chunk.type === "finish" &&
            (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")
          ) {
            failureChunk = chunk;
            break;
          }
          if (
            chunk.type === "text-delta" ||
            chunk.type === "reasoning-delta" ||
            chunk.type === "tool-call-delta"
          ) {
            sawContent = true;
          }
          if (sawContent) {
            if (buffered.length > 0) {
              yield* buffered;
              buffered.length = 0;
            }
            yield chunk;
          } else {
            buffered.push(chunk);
          }
        }
      } catch (error: unknown) {
        thrown = error;
      }
      if (failureChunk === undefined && thrown === undefined) {
        yield* buffered;
        return;
      }
      const failure =
        failureChunk !== undefined
          ? (failureChunk.reason as { failure: { code: string; message: string } }).failure
          : thrown instanceof LlmError
            ? thrown
            : { code: "TRANSPORT", message: String(thrown) };
      if (sawContent || nextProvider === undefined || !isRotatable(failure)) {
        yield* buffered;
        if (failureChunk !== undefined) {
          yield failureChunk;
          return;
        }
        throw thrown;
      }
      this.ctx.logger.warn(
        `provider-rotation: ${provider} hit ${failure.code}, retrying ${nextProvider}`,
      );
    }
  }
}

export const name = "provider-rotation";
export const inject = ["llm"];

/**
 * Registers one `<vendor>-pool` adapter per vendor that currently has two or
 * more registered accounts. Idempotent: already-registered pools are left
 * alone, so late-arriving accounts from a future registration do not
 * re-trigger this pool (a pool's membership is fixed at first registration,
 * matching #209's DialectAdapter rotation's own scope).
 */
export function apply(ctx: Context): void {
  const registeredPools = new Set<string>();

  /** Regroups all currently registered providers by vendor and registers any new multi-account pool. */
  const sync = (): void => {
    const groups = new Map<string, string[]>();
    for (const info of ctx.llm.listProviders()) {
      const base = vendorBaseId(info.id);
      const members = groups.get(base);
      if (members) members.push(info.id);
      else groups.set(base, [info.id]);
    }
    for (const [base, members] of groups) {
      if (members.length < 2) continue;
      const poolId = `${base}-pool`;
      if (registeredPools.has(poolId)) continue;
      registeredPools.add(poolId);
      const ordered = [...members].sort((a, b) => vendorSuffix(a) - vendorSuffix(b));
      ctx.llm.registerAdapter([poolId], new PoolAdapter(ctx, ordered));
      ctx.logger.info(`provider-rotation: registered ${poolId} over [${ordered.join(", ")}]`);
    }
  };

  ctx.effect(() => ctx.on("llm/adapters-updated", sync), "provider-rotation: adapter sync");
  sync();
}
