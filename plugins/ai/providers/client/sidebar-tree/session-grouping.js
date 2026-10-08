/**
 * Derives the sidebar tree's groups from the raw session/workspace/live-process
 * feeds: which chats are pinned, which folder each chat's workspace groups
 * under, which are ungrouped or archived, and which terminal sessions and
 * containers are currently live.
 *
 * Pulled out of `providers/client.js`'s `UnifiedWorkspacesBrowser` for #138.
 * The one behavior change from the pre-extraction version is #96: the old
 * "Active" group mixed running chats into the same list as live terminals and
 * containers. This grouping no longer produces a duplicate "active chats"
 * list at all -- a busy/running chat still renders exactly once, in whatever
 * group it already belongs to (pinned, its workspace folder, or Global), and
 * `isRunningSession` lets the row renderer decorate it with a running
 * indicator instead. Terminals and containers become their own groups
 * (`terminalRows` / `containerRows`), each independently counted and
 * collapsed, per #96's acceptance criterion.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/session-grouping
 */

var SIDEBAR_PINNED_STORAGE_KEY = "dsh_pinned_sessions";
var SIDEBAR_ARCHIVED_STORAGE_KEY = "dsh_archived_sessions";

/**
 * Read a JSON array of ids persisted to `localStorage`, tolerating a missing
 * or corrupt value.
 * @param key - the storage key.
 * @returns the parsed ids, or an empty array.
 */
function __dshReadStoredIdSet(key) {
  try {
    var parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

/**
 * A session's parent id, under whichever field the session shape uses.
 * @param session - a session record.
 * @returns the parent session id, or null for a top-level session.
 */
function __dshSessionParentId(session) {
  if (!session) return null;
  return (
    session.parentId || session.parentSessionId || session.parentSession || session.parent || null
  );
}

/**
 * Whether a session is a subagent of another session already in the feed --
 * subagents render nested under their parent chat row, not as top-level rows.
 * @param session - the candidate subagent.
 * @param sessionsById - the full session-id lookup.
 * @param sessionIds - the full session id list.
 * @returns whether `session` has a live parent.
 */
function __dshIsSubagentChild(session, sessionsById, sessionIds) {
  var parentId = __dshSessionParentId(session);
  return Boolean(parentId && (sessionsById[parentId] || sessionIds.indexOf(parentId) !== -1));
}

/**
 * Whether a session is running: busy, actively streaming, or mid-turn under
 * any of the shape variants the session feed has used. Used only to decorate
 * a chat row with a running indicator (#96) -- it no longer pulls the chat
 * into a separate "Active" list.
 * @param session - the session to check.
 * @returns whether the session is currently running.
 */
function __dshIsRunningSession(session) {
  return Boolean(
    session &&
      (session.busy === true ||
        session.running === true ||
        session.status === "busy" ||
        session.status === "running" ||
        session.phase === "running"),
  );
}

/**
 * Build the sidebar tree's grouped view of sessions, workspaces, terminals
 * and containers, plus the pin/archive predicates and mutators the row
 * renderers need.
 * @param input - `{ sessionList, workspaceList, terminals, containers, archiveSession, loadAll }`.
 * `archiveSession` is the injected cordis action (may reject, see
 * `session-action-dispatch.js`); `loadAll` refreshes the terminal/container
 * poll after a local mutation.
 * @returns the grouped sidebar data.
 */
function __dshGroupSidebarSessions(input) {
  var sessionList = input.sessionList || { ids: [], byId: {} };
  var workspaceList = input.workspaceList || { items: [] };
  var terminals = input.terminals || [];
  var containers = input.containers || [];

  var sessionsById = sessionList.byId || {};
  var sessionIds =
    sessionList.ids && sessionList.ids.length > 0
      ? sessionList.ids
      : sessionList.order && sessionList.order.length > 0
        ? sessionList.order
        : Object.keys(sessionsById);
  var workspaces = workspaceList.items || [];

  /**
   * A session's subagents, most-recently-updated first.
   * @param parentId - the parent session id.
   * @returns the subagent sessions.
   */
  function getSubagents(parentId) {
    if (!parentId) return [];
    return sessionIds
      .map(function (id) {
        return sessionsById[id];
      })
      .filter(function (session) {
        return session && __dshSessionParentId(session) === parentId;
      })
      .sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }

  var archivedSet = new Set();
  (workspaceList.archivedSessionIds || []).forEach(function (id) {
    archivedSet.add(id);
  });
  ((workspaceList.global && workspaceList.global.archivedSessionIds) || []).forEach(function (id) {
    archivedSet.add(id);
  });
  __dshReadStoredIdSet(SIDEBAR_ARCHIVED_STORAGE_KEY).forEach(function (id) {
    archivedSet.add(id);
  });

  /**
   * Whether a session is archived, by id or by its own flags.
   * @param session - the session record, when loaded.
   * @param sessionId - the session id, when only the id is known.
   * @returns whether the session is archived.
   */
  function isArchivedSession(session, sessionId) {
    if (!session && !sessionId) return false;
    var id = sessionId || (session && session.id);
    if (id && archivedSet.has(id)) return true;
    return Boolean(
      session && (session.isArchived || session.archived || session.status === "archived"),
    );
  }

  var pinnedSet = new Set(__dshReadStoredIdSet(SIDEBAR_PINNED_STORAGE_KEY));

  /**
   * Whether a session is pinned, by id or by its own flags.
   * @param session - the session record, when loaded.
   * @param sessionId - the session id, when only the id is known.
   * @returns whether the session is pinned.
   */
  function isPinnedSession(session, sessionId) {
    if (!session && !sessionId) return false;
    var id = sessionId || (session && session.id);
    if (id && pinnedSet.has(id)) return true;
    return Boolean(session && (session.isPinned || session.pinned || session.favorite));
  }

  var pinnedSessions = sessionIds
    .map(function (id) {
      return sessionsById[id];
    })
    .filter(function (session) {
      return (
        session &&
        !__dshIsSubagentChild(session, sessionsById, sessionIds) &&
        !isArchivedSession(session, session.id) &&
        isPinnedSession(session, session.id)
      );
    })
    .sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  var terminalRows = terminals.filter(function (session) {
    return Boolean(session.attached);
  });
  var containerRows = containers.filter(function (container) {
    return Boolean(container.isRunning);
  });

  var folderSessions = {};
  var accountedSessionIds = {};

  /** Trailing-slash-normalized workspace path, or undefined when the workspace has none. */
  function normalizedWorkspacePath(workspaceLike) {
    var path = workspaceLike.cwd || workspaceLike.path;
    if (!path) return undefined;
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  }

  workspaces.forEach(function (workspace) {
    var workspacePath = normalizedWorkspacePath(workspace);
    if (!workspacePath) return;
    if (!folderSessions[workspacePath]) folderSessions[workspacePath] = [];
    (workspace.sessionIds || []).forEach(function (sessionId) {
      var session = sessionsById[sessionId];
      if (!session) return;
      accountedSessionIds[sessionId] = true;
      if (
        !__dshIsSubagentChild(session, sessionsById, sessionIds) &&
        !isArchivedSession(session, sessionId)
      ) {
        folderSessions[workspacePath].push(session);
      }
    });
  });

  sessionIds.forEach(function (sessionId) {
    var session = sessionsById[sessionId];
    if (!session || accountedSessionIds[sessionId] || !session.workspaceId) return;
    var matchedWorkspace = workspaces.find(function (workspace) {
      return workspace.workspaceId === session.workspaceId;
    });
    if (!matchedWorkspace) return;
    var workspacePath = normalizedWorkspacePath(matchedWorkspace);
    if (!workspacePath) return;
    if (!folderSessions[workspacePath]) folderSessions[workspacePath] = [];
    accountedSessionIds[sessionId] = true;
    if (
      !__dshIsSubagentChild(session, sessionsById, sessionIds) &&
      !isArchivedSession(session, sessionId)
    ) {
      folderSessions[workspacePath].push(session);
    }
  });

  var ungroupedSessions = sessionIds
    .filter(function (sessionId) {
      var session = sessionsById[sessionId];
      return (
        !accountedSessionIds[sessionId] &&
        session &&
        !__dshIsSubagentChild(session, sessionsById, sessionIds) &&
        !isArchivedSession(session, sessionId) &&
        !isPinnedSession(session, sessionId)
      );
    })
    .map(function (sessionId) {
      return sessionsById[sessionId];
    });

  var archivedSessions = sessionIds
    .map(function (id) {
      return sessionsById[id];
    })
    .filter(function (session) {
      return (
        session &&
        !__dshIsSubagentChild(session, sessionsById, sessionIds) &&
        isArchivedSession(session, session.id)
      );
    })
    .sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  return {
    sessionsById: sessionsById,
    sessionIds: sessionIds,
    workspaces: workspaces,
    getSubagents: getSubagents,
    isPinnedSession: isPinnedSession,
    isArchivedSession: isArchivedSession,
    isRunningSession: __dshIsRunningSession,
    pinnedSessions: pinnedSessions,
    terminalRows: terminalRows,
    containerRows: containerRows,
    folderSessions: folderSessions,
    ungroupedSessions: ungroupedSessions,
    archivedSessions: archivedSessions,
    /**
     * Toggles a session's pinned state and persists it.
     * @param sessionId - the session to pin or unpin.
     */
    togglePinSession: function (sessionId) {
      if (pinnedSet.has(sessionId)) pinnedSet.delete(sessionId);
      else pinnedSet.add(sessionId);
      try {
        localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, JSON.stringify(Array.from(pinnedSet)));
      } catch (error) {
        // Storage unavailable (private mode, blocked site data): the pin
        // still applies for this render, but will not survive a reload.
      }
    },
    /**
     * Marks a session archived locally and requests the server-side archive.
     * @param sessionId - the session to archive.
     * @param archiveSession - the injected archive action; may reject (#98).
     * @returns the archive action's promise, so a caller can surface a failure.
     */
    archiveSessionLocally: function (sessionId, archiveSession) {
      archivedSet.add(sessionId);
      try {
        localStorage.setItem(SIDEBAR_ARCHIVED_STORAGE_KEY, JSON.stringify(Array.from(archivedSet)));
      } catch (error) {
        // See togglePinSession.
      }
      return archiveSession(sessionId);
    },
    /**
     * Restores an archived session to its normal group.
     * @param sessionId - the session to unarchive.
     * @param quotasApiBase - the quotas API base path.
     * @returns the unarchive request's promise.
     */
    unarchiveSession: function (sessionId, quotasApiBase) {
      archivedSet.delete(sessionId);
      try {
        localStorage.setItem(SIDEBAR_ARCHIVED_STORAGE_KEY, JSON.stringify(Array.from(archivedSet)));
      } catch (error) {
        // See togglePinSession.
      }
      return fetch(quotasApiBase + "/sessions/unarchive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });
    },
    /**
     * Permanently deletes an archived session.
     * @param sessionId - the session to delete.
     * @param quotasApiBase - the quotas API base path.
     * @returns the delete request's promise.
     */
    deletePermanentSession: function (sessionId, quotasApiBase) {
      archivedSet.delete(sessionId);
      try {
        localStorage.setItem(SIDEBAR_ARCHIVED_STORAGE_KEY, JSON.stringify(Array.from(archivedSet)));
      } catch (error) {
        // See togglePinSession.
      }
      return fetch(quotasApiBase + "/sessions/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });
    },
  };
}
