/**
 * Backfills the durable titles the harness session feed lists without.
 *
 * The `useSessions` feed fills a row's `title` from the host's persisted
 * projection cache, so a session whose log holds a `session/title` event but
 * whose cache row was never written arrives untitled and stays untitled until
 * opening the chat replays its log (#242). This hook asks the stack's
 * `/quotas/api/sessions/titles` route -- which reads the host's own title
 * projection -- for exactly those rows, in small batches so titles fill in
 * progressively instead of after one long request.
 *
 * Each id is requested at most once per mount: a session with no logged title
 * has none to gain while it stays cold, and a re-request would replay its log
 * again for the same empty answer.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/session-title-backfill
 */

/** Ids per request, matching the route's own per-request cap. */
var SIDEBAR_TITLE_BACKFILL_BATCH_SIZE = 64;

/**
 * Build the sidebar's cold-title backfill hook.
 * @param React - the host React runtime.
 * @returns the `useBackfilledSessionTitles(sessionList, quotasApiBase)` hook.
 */
function __dshCreateSessionTitleBackfill(React) {
  /**
   * Resolve the titles missing from the session feed's rows.
   * @param sessionList - the `useSessions` snapshot (`{ ids, byId }`).
   * @param quotasApiBase - the quotas API base path.
   * @returns resolved titles keyed by session id, growing as batches land.
   */
  return function useBackfilledSessionTitles(sessionList, quotasApiBase) {
    var titlesState = React.useState({});
    var titles = titlesState[0];
    var setTitles = titlesState[1];
    var requestedRef = React.useRef(null);
    if (requestedRef.current === null) requestedRef.current = {};
    var requested = requestedRef.current;

    var byId = (sessionList && sessionList.byId) || {};
    var ids = (sessionList && sessionList.ids) || [];
    var missing = [];
    for (var index = 0; index < ids.length; index += 1) {
      var sessionId = ids[index];
      var session = byId[sessionId];
      if (!session || session.blank || requested[sessionId]) continue;
      if (typeof session.title === "string" && session.title !== "") continue;
      missing.push(sessionId);
    }
    var missingKey = missing.join(",");

    React.useEffect(
      function () {
        if (!quotasApiBase || missing.length === 0) return undefined;
        var cancelled = false;
        var pending = missing.slice();
        pending.forEach(function (id) {
          requested[id] = true;
        });

        /** Resolve one batch, then continue with the next until the queue drains. */
        function requestNextBatch() {
          if (cancelled || pending.length === 0) return;
          var batch = pending.splice(0, SIDEBAR_TITLE_BACKFILL_BATCH_SIZE);
          fetch(quotasApiBase + "/sessions/titles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          })
            .then(function (response) {
              if (!response.ok) throw new Error("titles request failed: " + response.status);
              return response.json();
            })
            .then(function (payload) {
              if (cancelled) return;
              var resolved = (payload && payload.titles) || {};
              if (Object.keys(resolved).length > 0) {
                setTitles(function (previous) {
                  return Object.assign({}, previous, resolved);
                });
              }
              requestNextBatch();
            })
            .catch(function (error) {
              // Rows keep their host-supplied label; the console carries why
              // they did not gain a resolved title. Continue with the rest of
              // the queue so one failing batch does not block the others.
              console.warn("dsh sidebar: session title backfill failed", error);
              requestNextBatch();
            });
        }

        requestNextBatch();
        return function () {
          cancelled = true;
        };
      },
      // `missing` is derived from `missingKey`, so keying the effect on it
      // alone keeps unrelated feed updates from restarting the queue.
      [missingKey, quotasApiBase],
    );

    return titles;
  };
}
