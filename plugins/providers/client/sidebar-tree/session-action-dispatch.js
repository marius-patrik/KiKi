/**
 * Wraps the sidebar tree's row actions so a request the injected cordis
 * actions cannot service reports a visible failure instead of resolving as
 * if it had succeeded.
 *
 * Before #138, `providers/client.js`'s row menus called `renameSession` and
 * `forkSession` under a truthiness guard (`if (renameSession) ...`) and never
 * looked at what the call returned. The injected actions themselves
 * (`browserInjected` in `client.js`) resolved successfully even when there
 * was nothing to act on -- no session binding, no fork capability -- so a
 * user clicking "Rename" on a session with no live binding saw the menu
 * close and nothing else happen, with no way to tell the click had done
 * nothing (#98). `browserInjected` now rejects in that case instead of
 * resolving; this module is the other half -- it is the one place a
 * rejection surfaces to the person who clicked, regardless of which guarded
 * action produced it. `run` is exposed directly for actions like archive,
 * restore and delete that combine a local bookkeeping step (see
 * `session-grouping.js`) with the network request, so callers can compose
 * their own thunk instead of this module reaching into grouping state.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/session-action-dispatch
 */

/**
 * Build a dispatcher over one render's injected session actions.
 * @param actions - `{ renameSession, forkSession }`, from the
 * `sidebar.workspaces` slot's `browserInjected` props.
 * @param reportFailure - called with `{ action, message }` when a dispatched
 * action rejects or is unavailable; the sidebar tree renders this as a
 * dismissible notice (see `tree-notice.js`).
 * @returns the dispatcher.
 */
function __dshCreateSessionActionDispatch(actions, reportFailure) {
  /**
   * Run one action and report its rejection instead of swallowing it.
   * @param label - the human-readable action name for the failure notice.
   * @param thunk - produces the action's promise (or throws synchronously).
   */
  function run(label, thunk) {
    var result;
    try {
      result = thunk();
    } catch (error) {
      reportFailure({ action: label, message: (error && error.message) || String(error) });
      return;
    }
    if (result && typeof result.then === "function") {
      result.catch(function (error) {
        reportFailure({ action: label, message: (error && error.message) || label + " failed." });
      });
    }
  }

  return {
    /** Runs any action, surfacing its rejection under `label` (see `run` above). */
    run: run,
    /**
     * Renames a session, surfacing a failure when the session has no live
     * binding to rename.
     * @param sessionId - the session to rename.
     * @param title - the new title.
     */
    rename: function (sessionId, title) {
      if (typeof actions.renameSession !== "function") {
        reportFailure({ action: "Rename", message: "Renaming isn't available right now." });
        return;
      }
      run("Rename", function () {
        return actions.renameSession(sessionId, title);
      });
    },
    /**
     * Forks a session, surfacing a failure when forking is unavailable.
     * @param sessionId - the session to fork.
     */
    fork: function (sessionId) {
      if (typeof actions.forkSession !== "function") {
        reportFailure({ action: "Fork", message: "Forking isn't available right now." });
        return;
      }
      run("Fork", function () {
        return actions.forkSession(sessionId);
      });
    },
  };
}
