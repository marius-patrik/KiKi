/**
 * The label one sidebar session row shows.
 *
 * A session row's data comes from the harness `useSessions` feed, whose rows
 * carry two title fields: `title` -- the durable log-backed title, present
 * only when the host has already projected it -- and `displayTitle`, the
 * host's own human-facing projection of that title, the session's project
 * directory basename, then its id. Reading `title` alone collapses every
 * not-yet-projected row to a placeholder (#242), so the label walks the same
 * order the host does, with the stack's cold-title backfill
 * (`session-title-backfill.js`) slotted in ahead of the directory fallback.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/session-row-title
 */

/**
 * A session's durable title as far as the client knows it: the host's own
 * projected title, else the title the cold-title backfill resolved from the
 * session log. Empty when the session has never been titled.
 * @param session - a session row from the `useSessions` feed.
 * @param backfilledTitles - resolved cold titles keyed by session id.
 * @returns the durable title, or an empty string.
 */
function __dshSessionDurableTitle(session, backfilledTitles) {
  if (!session) return "";
  if (typeof session.title === "string" && session.title !== "") return session.title;
  var backfilled = backfilledTitles && backfilledTitles[session.id];
  return typeof backfilled === "string" && backfilled !== "" ? backfilled : "";
}

/**
 * The label a session row renders.
 * @param session - a session row from the `useSessions` feed.
 * @param backfilledTitles - resolved cold titles keyed by session id.
 * @param placeholder - the label for a session that has no title to show.
 * @returns the row's label.
 */
function __dshSessionRowTitle(session, backfilledTitles, placeholder) {
  if (!session) return placeholder;
  var durable = __dshSessionDurableTitle(session, backfilledTitles);
  if (durable) return durable;
  // A blank session has no log to have been titled from, so it reads as new
  // rather than as a session whose title failed to arrive.
  if (session.blank) return "New Chat";
  var displayTitle = session.displayTitle;
  if (typeof displayTitle === "string" && displayTitle !== "" && displayTitle !== session.id) {
    return displayTitle;
  }
  return placeholder;
}
