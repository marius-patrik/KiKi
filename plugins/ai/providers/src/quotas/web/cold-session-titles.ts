/**
 * Resolves durable session titles for sessions the Host has not loaded.
 *
 * The sidebar's session rows arrive through the `useSessions` standard slot
 * prop, whose `title` field the Host fills in only from its persisted
 * projection cache: a cold session with no cache row is listed without a
 * title even though its log carries a `session/title` event, so the row falls
 * back to a placeholder until opening the chat replays the log. This resolver
 * closes that gap by asking the Host's own session-query service for the same
 * projection block `api-session`'s cold list path reads, so the title the
 * sidebar shows is the Host's title projection rather than a second
 * title implementation.
 *
 * Observations are expensive (each one replays a whole session log), so a
 * resolved title is remembered for the life of the process and a negative
 * result is remembered too -- a session with no logged title never gains one
 * while it stays cold.
 *
 * @module providers/quotas/web/cold-session-titles
 */

import type { Context } from "@deepseek-ai/cordis";

/** The slice of one Host session observation this resolver reads. */
interface ColdSessionObservation {
  readonly projections?: { readonly values: Readonly<Record<string, unknown>> };
}

/** The slice of the Host `sessionQuery` service this resolver calls. */
interface ColdSessionReader {
  observeSession(
    sessionId: string,
    options: { readonly projectionMode: "all" },
  ): Promise<ColdSessionObservation>;
}

/** Most ids one request may ask about, so a caller cannot queue unbounded log replays. */
export const COLD_TITLE_IDS_PER_REQUEST = 64;

/** Concurrent observations, keeping the replay cost off the Host's request path. */
const OBSERVATION_CONCURRENCY = 4;

/** Session id to its resolved title, or `null` once the session is known to have none. */
const resolvedTitles = new Map<string, string | null>();

/** Release one observation lease, whether or not the Host handed back a disposable. */
function releaseObservation(observation: ColdSessionObservation): void {
  const dispose = Reflect.get(observation as object, Symbol.dispose);
  if (typeof dispose === "function") Reflect.apply(dispose, observation, []);
}

/** Read one cold session's logged title through the Host's title projection. */
async function observeTitle(reader: ColdSessionReader, sessionId: string): Promise<string | null> {
  const observation = await reader.observeSession(sessionId, { projectionMode: "all" });
  try {
    const title = observation.projections?.values["title"];
    return typeof title === "string" && title !== "" ? title : null;
  } finally {
    releaseObservation(observation);
  }
}

/**
 * Resolve the durable titles of sessions the Host listed without one.
 * @param ctx - the plugin context carrying the Host's `sessionQuery` service.
 * @param ids - session ids to resolve; ids past the per-request cap are ignored.
 * @returns each id that has a logged title, mapped to that title.
 * @throws {Error} when the Host has no `sessionQuery` service mounted, so a
 * caller sees the missing capability instead of an empty result that looks
 * like "none of these sessions has a title".
 */
export async function resolveColdSessionTitles(
  ctx: Context,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const reader = ctx.get("sessionQuery") as ColdSessionReader | undefined;
  if (reader === undefined) {
    throw new Error("session titles are unavailable: the host has no sessionQuery service");
  }

  const pending = ids.slice(0, COLD_TITLE_IDS_PER_REQUEST);
  const titles: Record<string, string> = {};

  const workers = Array.from({ length: Math.min(OBSERVATION_CONCURRENCY, pending.length) }, () =>
    (async () => {
      for (;;) {
        const sessionId = pending.shift();
        if (sessionId === undefined) return;
        let title = resolvedTitles.get(sessionId);
        if (title === undefined) {
          try {
            title = await observeTitle(reader, sessionId);
          } catch (error) {
            // A single unreadable session must not fail the whole batch: leave
            // it unresolved so a later request can retry it once the Host can
            // read it again.
            ctx.logger.warn(`providers: cold title for "${sessionId}" failed: ${String(error)}`);
            continue;
          }
          resolvedTitles.set(sessionId, title);
        }
        if (title !== null) titles[sessionId] = title;
      }
    })(),
  );

  await Promise.all(workers);
  return titles;
}
