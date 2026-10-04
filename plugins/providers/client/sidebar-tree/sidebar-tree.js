/**
 * The sidebar tree: the component mounted into the harness `sidebar.workspaces`
 * slot, and the single implementation owner of the sidebar's section groups,
 * the rows they render, and their context menus.
 *
 * Extracted out of `providers/client.js`'s `UnifiedWorkspacesBrowser` for
 * #138, landing three settled product decisions with the extraction:
 *
 * - #96 -- the old `Active` group mixed running chats, live terminal
 *   sessions and running containers into one list. It is replaced by a
 *   `Containers` group and a `Terminals` group, each independently counted
 *   and collapsed. A busy/running chat is not duplicated into a separate
 *   live list; it renders once, in whichever group it already belongs to
 *   (Pinned, its workspace folder, or Global), decorated with a running dot
 *   (see `tree-row.js`).
 * - #97 (Ungrouped -> Global) shipped separately in #131; this extraction
 *   only carries the label forward unchanged.
 * - #103 -- `treeLayout`, read from the `@dsh-stack/sidebar-preferences`
 *   store via cordis DI (`props.preferences`, injected as
 *   `ctx.sidebarPreferences` by `providers/client.js`'s `apply`), toggles
 *   between `"sections"` (each group visually separated, today's look) and
 *   `"unified"` (the same groups, laid out as one continuous tree with no
 *   dividers between them). The control lives in the sidebar's Settings
 *   section (`@dsh-stack/sidebar-settings`), matching every other sidebar
 *   preference.
 *
 * Every row action -- pin, rename, fork, archive, restore, delete -- runs
 * through `session-action-dispatch.js`, so an action the injected cordis
 * service cannot service reports a visible failure instead of silently
 * doing nothing (#98).
 *
 * @module @dsh-stack/providers/client/sidebar-tree/sidebar-tree
 */

var SIDEBAR_TREE_ROOT_PATH = "/";
var SIDEBAR_TREE_DEFAULT_DIRECTORY = "/Users/user/Projects";
var SIDEBAR_TREE_AUTO_EXPANDED_PATHS = [
  SIDEBAR_TREE_ROOT_PATH,
  "/Users",
  "/Users/user",
  SIDEBAR_TREE_DEFAULT_DIRECTORY,
];
var SIDEBAR_TREE_LIVE_POLL_INTERVAL_MS = 5000;
var SIDEBAR_TREE_SEARCH_TOGGLE_EVENT = "dsh:sidebar-search-toggle";
var SIDEBAR_TREE_SEARCH_TRIGGER_EVENT = "dsh:trigger-sidebar-search";
var SIDEBAR_TREE_SEARCH_VISIBILITY_KEY = "dsh_show_sidebar_search";

/**
 * Build the sidebar tree component bound to one providers client runtime.
 * @param runtime - `{ React, h, glyphs, SelectDropdownMenu, renderAppIcon,
 * formatTimeAgo, ensureTreeStyles, ensureModelPickerDecoration, quotasApi }`.
 * @returns the React component to register into `sidebar.workspaces`.
 */
function __dshCreateSidebarTree(runtime) {
  var React = runtime.React;
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var quotasApi = runtime.quotasApi;

  var renderChatRowShapes = __dshCreateTreeRow(runtime);
  var renderChatRow = renderChatRowShapes.renderChatRow;
  var renderArchivedChatRow = renderChatRowShapes.renderArchivedChatRow;
  var liveProcessRows = __dshCreateLiveProcessRow(runtime);
  var renderTreeGroup = __dshCreateTreeGroup(runtime);
  var renderTreeNotice = __dshCreateTreeNotice(runtime);
  var renderNewItemMenu = __dshCreateNewItemMenu(runtime);
  var renderDirEntries = __dshCreateDirectoryEntries(runtime, renderChatRow, renderNewItemMenu);
  var renderCollapsedRail = __dshCreateCollapsedRail(runtime);
  var useBackfilledSessionTitles = __dshCreateSessionTitleBackfill(React);

  /**
   * Read one feed hook defensively: a slot's injected hook may be absent
   * while the host is still assembling, and the tree still has to render on
   * every pass with the same number of hook calls (React error #310,
   * dsh-stack#195) -- so the caller always invokes this, never conditionally.
   * @param useFeed - the injected hook, when the host provided one.
   * @param fallback - the shape to fall back to.
   * @returns the feed snapshot.
   */
  function readFeed(useFeed, fallback) {
    var hook =
      typeof useFeed === "function"
        ? useFeed
        : function () {
            return fallback;
          };
    try {
      return (
        hook(function (snapshot) {
          return snapshot;
        }) || fallback
      );
    } catch (error) {
      return fallback;
    }
  }

  /** Subscribe to one window event for the lifetime of a component. */
  function listenOnWindow(name, handler) {
    window.addEventListener(name, handler);
    return function () {
      window.removeEventListener(name, handler);
    };
  }

  /** Whether the sidebar search affordance is switched on, as Settings last left it. */
  function readSearchVisibility() {
    if (typeof window === "undefined" || !window.localStorage) return true;
    return window.localStorage.getItem(SIDEBAR_TREE_SEARCH_VISIBILITY_KEY) !== "false";
  }

  /**
   * The sidebar tree.
   * @param props - the `sidebar.workspaces` slot props: `{ wide,
   * expandSidebar, useSessions, useWorkspaces, open, startSession,
   * renameSession, archiveSession, forkSession, createWorkspace,
   * preferences }`.
   * @returns the tree, or the collapsed rail when the sidebar is narrow.
   */
  function SidebarTree(props) {
    runtime.ensureTreeStyles();
    runtime.ensureModelPickerDecoration();

    var wide = Boolean(props && props.wide);
    var expandSidebar = props && props.expandSidebar;
    var preferences = props && props.preferences;

    var sessionList = readFeed(props && props.useSessions, { ids: [], byId: {} });
    var workspaceList = readFeed(props && props.useWorkspaces, { items: [] });
    var backfilledTitles = useBackfilledSessionTitles(sessionList, quotasApi);

    var openSession = props && props.open;
    var startSession = props && props.startSession;
    var createWorkspace = props && props.createWorkspace;

    var treeLayoutState = React.useState(function () {
      return preferences ? preferences.get().treeLayout : "sections";
    });
    var treeLayout = treeLayoutState[0],
      setTreeLayout = treeLayoutState[1];
    React.useEffect(
      function () {
        if (!preferences) return undefined;
        setTreeLayout(preferences.get().treeLayout);
        return preferences.subscribe(function () {
          setTreeLayout(preferences.get().treeLayout);
        });
      },
      [preferences],
    );
    var groupWrapperStyle =
      treeLayout === "unified" ? { border: "none", margin: 0, paddingBottom: 0 } : undefined;

    var isPinnedOpenState = React.useState(true);
    var isPinnedOpen = isPinnedOpenState[0],
      setIsPinnedOpen = isPinnedOpenState[1];
    var isContainersOpenState = React.useState(true);
    var isContainersOpen = isContainersOpenState[0],
      setIsContainersOpen = isContainersOpenState[1];
    var isTerminalsOpenState = React.useState(true);
    var isTerminalsOpen = isTerminalsOpenState[0],
      setIsTerminalsOpen = isTerminalsOpenState[1];
    var isHostOpenState = React.useState(true);
    var isHostOpen = isHostOpenState[0],
      setIsHostOpen = isHostOpenState[1];
    var isDriveOpenState = React.useState(true);
    var isDriveOpen = isDriveOpenState[0],
      setIsDriveOpen = isDriveOpenState[1];
    var isGlobalOpenState = React.useState(true);
    var isGlobalOpen = isGlobalOpenState[0],
      setIsGlobalOpen = isGlobalOpenState[1];
    var isArchivedOpenState = React.useState(false);
    var isArchivedOpen = isArchivedOpenState[0],
      setIsArchivedOpen = isArchivedOpenState[1];

    var expandedPathsState = React.useState(function () {
      var initial = {};
      SIDEBAR_TREE_AUTO_EXPANDED_PATHS.forEach(function (path) {
        initial[path] = true;
      });
      return initial;
    });
    var expandedPaths = expandedPathsState[0],
      setExpandedPaths = expandedPathsState[1];
    var expandedSubagentsState = React.useState({});
    var expandedSubagents = expandedSubagentsState[0],
      setExpandedSubagents = expandedSubagentsState[1];
    var dirCacheState = React.useState({});
    var dirCache = dirCacheState[0],
      setDirCache = dirCacheState[1];
    var loadingPathsState = React.useState({});
    var loadingPaths = loadingPathsState[0],
      setLoadingPaths = loadingPathsState[1];
    var terminalsState = React.useState([]);
    var terminals = terminalsState[0],
      setTerminals = terminalsState[1];
    var containersState = React.useState([]);
    var containers = containersState[0],
      setContainers = containersState[1];
    var plusMenuState = React.useState(null);
    var plusMenu = plusMenuState[0],
      setPlusMenu = plusMenuState[1];
    var ellipsisOpenState = React.useState(null);
    var ellipsisOpen = ellipsisOpenState[0],
      setEllipsisOpen = ellipsisOpenState[1];
    var searchQueryState = React.useState("");
    var searchQuery = searchQueryState[0],
      setSearchQuery = searchQueryState[1];
    var searchExpandedState = React.useState(false);
    var searchExpanded = searchExpandedState[0],
      setSearchExpanded = searchExpandedState[1];
    var showSearchButtonState = React.useState(readSearchVisibility);
    var showSearchButton = showSearchButtonState[0],
      setShowSearchButton = showSearchButtonState[1];
    var viewOptionsOpenState = React.useState(false);
    var viewOptionsOpen = viewOptionsOpenState[0],
      setViewOptionsOpen = viewOptionsOpenState[1];
    var noticeState = React.useState(null);
    var notice = noticeState[0],
      setNotice = noticeState[1];

    var searchInputRef = React.useRef(null);
    var viewOptionsButtonRef = React.useRef(null);
    var railPlusButtonRef = React.useRef(null);

    /** Surfaces a guarded action's failure as a dismissible notice (#98). */
    function reportFailure(failure) {
      setNotice(failure);
    }

    var dispatch = __dshCreateSessionActionDispatch(
      {
        renameSession: props && props.renameSession,
        archiveSession: props && props.archiveSession,
        forkSession: props && props.forkSession,
      },
      reportFailure,
    );

    var fetchDirectory = React.useCallback(function (path) {
      if (!path) return;
      setLoadingPaths(function (previous) {
        var next = Object.assign({}, previous);
        next[path] = true;
        return next;
      });
      fetch(quotasApi + "/fs?path=" + encodeURIComponent(path))
        .then(function (response) {
          return response.json();
        })
        .then(function (body) {
          setDirCache(function (previous) {
            var next = Object.assign({}, previous);
            next[path] = body.entries || [];
            return next;
          });
        })
        .catch(function () {})
        .finally(function () {
          setLoadingPaths(function (previous) {
            var next = Object.assign({}, previous);
            delete next[path];
            return next;
          });
        });
    }, []);

    var loadAll = React.useCallback(function () {
      fetch(quotasApi + "/tmux/sessions")
        .then(function (response) {
          return response.json();
        })
        .then(function (body) {
          setTerminals(body.sessions || []);
        })
        .catch(function () {});
      fetch(quotasApi + "/docker/containers")
        .then(function (response) {
          return response.json();
        })
        .then(function (body) {
          setContainers(body.containers || []);
        })
        .catch(function () {});
    }, []);

    React.useEffect(
      function () {
        SIDEBAR_TREE_AUTO_EXPANDED_PATHS.forEach(fetchDirectory);
        loadAll();
        var timer = setInterval(loadAll, SIDEBAR_TREE_LIVE_POLL_INTERVAL_MS);
        return function () {
          clearInterval(timer);
        };
      },
      [fetchDirectory, loadAll],
    );

    React.useEffect(function () {
      return listenOnWindow(SIDEBAR_TREE_SEARCH_TOGGLE_EVENT, function (event) {
        var enabled =
          event && event.detail && event.detail.enabled !== undefined
            ? event.detail.enabled
            : readSearchVisibility();
        setShowSearchButton(Boolean(enabled));
      });
    }, []);

    React.useEffect(function () {
      return listenOnWindow(SIDEBAR_TREE_SEARCH_TRIGGER_EVENT, function () {
        setSearchExpanded(true);
        window.dispatchEvent(new CustomEvent("dsh:expand-sidebar"));
        setTimeout(function () {
          if (!searchInputRef.current) return;
          searchInputRef.current.focus();
          if (typeof searchInputRef.current.select === "function") searchInputRef.current.select();
        }, 80);
      });
    }, []);

    /** Toggles whether a subagent's children render nested under it. */
    function toggleSubagentExpand(sessionId) {
      setExpandedSubagents(function (previous) {
        var next = Object.assign({}, previous);
        if (next[sessionId]) delete next[sessionId];
        else next[sessionId] = true;
        return next;
      });
    }

    /** Expands or collapses a directory, fetching its entries the first time it opens. */
    function toggleExpand(dirPath) {
      setExpandedPaths(function (previous) {
        var next = Object.assign({}, previous);
        if (next[dirPath]) {
          delete next[dirPath];
        } else {
          next[dirPath] = true;
          if (!dirCache[dirPath]) fetchDirectory(dirPath);
        }
        return next;
      });
    }

    /**
     * Opens a chat: focuses it in the workspace, and tells every other
     * surface listening for the focus event.
     */
    function onOpenChat(sessionId, sessionTitle) {
      if (!sessionId) return;
      if (typeof window !== "undefined") {
        window.__dsh_current_session_id__ = sessionId;
        if (sessionTitle) window.__dsh_current_session_title__ = sessionTitle;
      }
      if (openSession) {
        try {
          openSession(sessionId);
        } catch (error) {
          // The injected open action threw synchronously; the focus event
          // dispatched below still gives other surfaces a chance to react.
        }
      }
      if (typeof window !== "undefined" && window.__dsh_ctx__ && window.__dsh_ctx__.sessions) {
        try {
          window.__dsh_ctx__.sessions.open(sessionId);
        } catch (error) {
          // See above.
        }
      }
      window.dispatchEvent(
        new CustomEvent("dsh:focus-chat", {
          detail: { id: sessionId, title: sessionTitle || "Conversation" },
        }),
      );
    }

    /** Starts (or opens) a chat session rooted at a directory. */
    function onCreateChat(dirPath, workspaces) {
      var path = dirPath || SIDEBAR_TREE_DEFAULT_DIRECTORY;
      var existing = workspaces.find(function (workspace) {
        return workspace.path === path;
      });
      if (existing) {
        if (startSession) startSession(existing.workspaceId);
      } else if (createWorkspace) {
        createWorkspace({ path: path })
          .then(function (newWorkspace) {
            if (startSession) startSession(newWorkspace ? newWorkspace.workspaceId : undefined);
          })
          .catch(function () {
            if (startSession) startSession();
          });
      } else if (startSession) {
        startSession();
      }
    }

    /** Starts a new named terminal session rooted at a directory. */
    function onCreateTerminal(dirPath) {
      var path = dirPath || SIDEBAR_TREE_DEFAULT_DIRECTORY;
      var baseName = path.split("/").pop() || "term";
      var name = prompt(
        "Terminal session name:",
        baseName + "-" + Math.floor(Math.random() * 1000),
      );
      if (!name) return;
      fetch(quotasApi + "/tmux/sessions/new", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name, cwd: path }),
      }).then(function () {
        loadAll();
        window.dispatchEvent(new CustomEvent("dsh:open-terminal", { detail: { session: name } }));
      });
    }

    /** Requests a new sandbox container rooted at a directory. */
    function onCreateContainer(dirPath) {
      window.dispatchEvent(
        new CustomEvent("dsh:open-container", { detail: { cwd: dirPath || undefined } }),
      );
    }

    /** Creates a new directory under `dirPath` and refreshes its listing. */
    function onCreateFolder(dirPath) {
      var path = dirPath || SIDEBAR_TREE_DEFAULT_DIRECTORY;
      var dirName = prompt("New directory name in " + path + ":");
      if (!dirName || !dirName.trim()) return;
      fetch(quotasApi + "/fs/mkdir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: path + "/" + dirName.trim() }),
      }).then(loadAll);
    }

    /** Opens a folder as a new workspace. */
    function onOpenWorkspace(dirPath) {
      var defaultPath = dirPath || SIDEBAR_TREE_DEFAULT_DIRECTORY;
      var typedPath = prompt("Enter directory path for new Workspace:", defaultPath);
      if (!typedPath || !typedPath.trim()) return;
      var cleanPath = typedPath.trim();
      if (createWorkspace) {
        createWorkspace({ path: cleanPath }).then(function (workspace) {
          if (startSession) startSession(workspace ? workspace.workspaceId : undefined);
          loadAll();
        });
      } else {
        onCreateChat(cleanPath, []);
      }
    }

    /**
     * Archives one session: updates the local pinned/archived bookkeeping
     * `session-grouping.js` owns, then requests the server-side archive,
     * surfacing a failure instead of leaving the row looking unchanged (#98).
     * @param sessionId - the session to archive.
     */
    function onArchiveChat(sessionId) {
      dispatch.run("Archive", function () {
        return grouping.archiveSessionLocally(sessionId, props && props.archiveSession);
      });
    }

    /** Archives every session titled "pong" or "ping" -- the sidebar's bulk-cleanup action. */
    function onArchiveEmptyChats(grouping) {
      grouping.sessionIds.forEach(function (id) {
        var session = grouping.sessionsById[id];
        var title = ((session && (session.displayTitle || session.title || session.name)) || "")
          .trim()
          .toLowerCase();
        if (title === "pong" || title === "ping") onArchiveChat(id);
      });
      fetch(quotasApi + "/sessions/archive-pong", { method: "POST" })
        .then(function (response) {
          return response.json();
        })
        .then(function (body) {
          alert("Archived " + (body.archivedCount || 0) + " empty / pong sessions.");
          loadAll();
        })
        .catch(loadAll);
    }

    var grouping = __dshGroupSidebarSessions({
      sessionList: sessionList,
      workspaceList: workspaceList,
      terminals: terminals,
      containers: containers,
    });

    /** Matches a chat's label/id against the tree's search query. */
    function matchesSearch(chat) {
      if (!searchQuery || !searchQuery.trim()) return true;
      var query = searchQuery.trim().toLowerCase();
      var label = __dshSessionRowTitle(chat, backfilledTitles, "");
      return (label + " " + (chat.id || "")).toLowerCase().indexOf(query) !== -1;
    }

    var filteredPinnedSessions = grouping.pinnedSessions.filter(matchesSearch);
    var filteredGlobalSessions = grouping.ungroupedSessions.filter(matchesSearch);

    var chatRowCtx = {
      currentSessionId: sessionList ? sessionList.current : undefined,
      grouping: grouping,
      dispatch: dispatch,
      ellipsisOpen: ellipsisOpen,
      setEllipsisOpen: setEllipsisOpen,
      expandedSubagents: expandedSubagents,
      toggleSubagentExpand: toggleSubagentExpand,
      onOpenChat: onOpenChat,
      onArchiveChat: onArchiveChat,
      quotasApiBase: quotasApi,
      loadAll: loadAll,
      onActionFailure: reportFailure,
      backfilledTitles: backfilledTitles,
    };

    var liveProcessRowCtx = {
      quotasApiBase: quotasApi,
      ellipsisOpen: ellipsisOpen,
      setEllipsisOpen: setEllipsisOpen,
      loadAll: loadAll,
      onActionFailure: reportFailure,
    };

    var newItemMenuCtx = {
      plusMenu: plusMenu,
      setPlusMenu: setPlusMenu,
      onCreateChat: function (dirPath) {
        onCreateChat(dirPath, grouping.workspaces);
      },
      onCreateTerminal: onCreateTerminal,
      onCreateContainer: onCreateContainer,
      onCreateFolder: onCreateFolder,
      onOpenWorkspace: onOpenWorkspace,
      onArchiveEmptyChats: function () {
        onArchiveEmptyChats(grouping);
      },
    };

    if (!wide) {
      var totalLive = grouping.terminalRows.length + grouping.containerRows.length;
      /** Expands the sidebar out of its collapsed rail. */
      function handleExpand(event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (typeof expandSidebar === "function") expandSidebar();
        else {
          var toggleButton = document.querySelector(
            'button[class*="toggle"], button[aria-label*="sidebar"], button[aria-label*="Sidebar"]',
          );
          if (toggleButton) toggleButton.click();
        }
      }
      return renderCollapsedRail({
        showSearchButton: showSearchButton,
        handleExpand: handleExpand,
        setSearchExpanded: setSearchExpanded,
        searchInputRef: searchInputRef,
        plusMenu: plusMenu,
        setPlusMenu: setPlusMenu,
        railPlusButtonRef: railPlusButtonRef,
        totalLive: totalLive,
        firstTerminalName: terminals[0] ? terminals[0].name : undefined,
        onCreateChat: function () {
          onCreateChat(undefined, grouping.workspaces);
        },
        onCreateTerminal: function () {
          onCreateTerminal(undefined);
        },
        onCreateContainer: function () {
          onCreateContainer(undefined);
        },
      });
    }

    return h(
      "div",
      {
        className: "dsh-sidebar-tree-container",
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "stretch",
          width: "100%",
          height: "100%",
          overflowY: "auto",
          gap: "2px",
          padding: "0 0 8px 0",
        },
      },

      renderHeader(),
      renderTreeNotice(notice, function () {
        setNotice(null);
      }),

      filteredPinnedSessions.length > 0
        ? renderTreeGroup({
            icon: h(glyphs.Pin, { size: 14 }),
            title: "Pinned",
            count: filteredPinnedSessions.length,
            countTone: "primary",
            open: isPinnedOpen,
            onToggle: function () {
              setIsPinnedOpen(!isPinnedOpen);
            },
            actions: renderNewItemMenu(null, "pinned-plus", newItemMenuCtx),
            wrapperStyle: groupWrapperStyle,
            children: filteredPinnedSessions.map(function (chat) {
              return renderChatRow(chat, 16, chatRowCtx);
            }),
          })
        : null,

      renderTreeGroup({
        icon: h(glyphs.Containers, { size: 14 }),
        title: "Containers",
        count: grouping.containerRows.length,
        countTone: "success",
        open: isContainersOpen,
        onToggle: function () {
          setIsContainersOpen(!isContainersOpen);
        },
        actions: renderNewItemMenu(null, "containers-plus", newItemMenuCtx),
        wrapperStyle: groupWrapperStyle,
        emptyText: "(no running containers)",
        children: grouping.containerRows.map(function (container) {
          return liveProcessRows.renderContainerRow(container, liveProcessRowCtx);
        }),
      }),

      renderTreeGroup({
        icon: h(glyphs.Terminals, { size: 14 }),
        title: "Terminals",
        count: grouping.terminalRows.length,
        countTone: "success",
        open: isTerminalsOpen,
        onToggle: function () {
          setIsTerminalsOpen(!isTerminalsOpen);
        },
        actions: renderNewItemMenu(null, "terminals-plus", newItemMenuCtx),
        wrapperStyle: groupWrapperStyle,
        emptyText: "(no live terminals)",
        children: grouping.terminalRows.map(function (session) {
          return liveProcessRows.renderTerminalRow(session, liveProcessRowCtx);
        }),
      }),

      renderTreeGroup({
        icon: h(glyphs.HostMachine, { size: 15 }),
        title: "Host Machine",
        open: isHostOpen,
        onToggle: function () {
          setIsHostOpen(!isHostOpen);
        },
        actions: renderNewItemMenu(SIDEBAR_TREE_ROOT_PATH, "host-plus", newItemMenuCtx),
        wrapperStyle: groupWrapperStyle,
        children: [renderDriveGroup()],
      }),

      renderTreeGroup({
        icon: h(glyphs.BlueFolder, { size: 14 }),
        title: "Global",
        count: filteredGlobalSessions.length,
        countTone: "muted",
        open: isGlobalOpen,
        onToggle: function () {
          setIsGlobalOpen(!isGlobalOpen);
        },
        actions: renderNewItemMenu(null, "global-plus", newItemMenuCtx),
        wrapperStyle: groupWrapperStyle,
        emptyText: "(no ungrouped sessions)",
        children: filteredGlobalSessions.map(function (chat) {
          return renderChatRow(chat, 16, chatRowCtx);
        }),
      }),

      grouping.archivedSessions.length > 0
        ? renderTreeGroup({
            icon: h(glyphs.ArchiveBox, { size: 14 }),
            title: "Archived",
            open: isArchivedOpen,
            onToggle: function () {
              setIsArchivedOpen(!isArchivedOpen);
            },
            wrapperStyle: Object.assign(
              { borderBottom: "none" },
              treeLayout === "unified"
                ? { borderTop: "none", marginTop: 0, paddingTop: 0 }
                : {
                    marginTop: "12px",
                    paddingTop: "6px",
                    borderTop: "1px solid var(--dsw-alias-border-l1)",
                  },
            ),
            children: grouping.archivedSessions.map(function (chat) {
              return renderArchivedChatRow(chat, 16, chatRowCtx);
            }),
          })
        : null,
    );

    /** Renders the Drive sub-group (Macintosh HD) nested under Host Machine. */
    function renderDriveGroup() {
      var rootChats = grouping.folderSessions[SIDEBAR_TREE_ROOT_PATH] || [];
      return h(
        "div",
        { key: "drive-group", style: { display: "flex", flexDirection: "column", width: "100%" } },
        h(
          "div",
          {
            className: "dsh-tree-projectRow",
            role: "treeitem",
            style: { position: "relative", paddingLeft: "24px", fontWeight: 500, height: "28px" },
            "aria-expanded": isDriveOpen,
            onClick: function () {
              setIsDriveOpen(!isDriveOpen);
            },
          },
          h(
            "span",
            { className: "dsh-tree-slot dsh-tree-icon" },
            h(glyphs.HardDrive, { size: 15 }),
          ),
          h(
            "span",
            { className: "dsh-tree-slot dsh-tree-chevron" },
            h(glyphs.TriangleRight, {
              className: "dsh-tree-arrow" + (isDriveOpen ? " dsh-tree-arrowOpen" : ""),
              size: 11,
            }),
          ),
          h("span", { className: "dsh-tree-title" }, "Macintosh HD"),
          h(
            "span",
            { className: "dsh-tree-actions" },
            renderNewItemMenu(SIDEBAR_TREE_ROOT_PATH, "drive-plus", newItemMenuCtx),
          ),
        ),
        isDriveOpen
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", width: "100%" } },
              rootChats.length > 0
                ? h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        marginBottom: "4px",
                        paddingBottom: "4px",
                        borderBottom: "1px dashed var(--dsw-alias-border-l1)",
                      },
                    },
                    rootChats.map(function (chat) {
                      return renderChatRow(chat, 40, chatRowCtx);
                    }),
                  )
                : null,
              renderDirEntries(SIDEBAR_TREE_ROOT_PATH, 2, {
                dirCache: dirCache,
                loadingPaths: loadingPaths,
                searchQuery: searchQuery,
                expandedPaths: expandedPaths,
                toggleExpand: toggleExpand,
                folderSessions: grouping.folderSessions,
                workspaces: grouping.workspaces,
                ellipsisOpen: ellipsisOpen,
                setEllipsisOpen: setEllipsisOpen,
                newItemMenuCtx: newItemMenuCtx,
                chatRowCtx: chatRowCtx,
              }),
            )
          : null,
      );
    }

    /** Renders the tree's header: title or search input, plus search/view-options/add-workspace actions. */
    function renderHeader() {
      return h(
        "div",
        {
          className: "dsh-sidebar-section-header",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 8px 8px 10px",
            minHeight: "36px",
            flex: "0 0 auto",
            borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
            userSelect: "none",
          },
        },
        searchExpanded
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  flex: 1,
                  gap: "6px",
                  background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.06))",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--dsw-alias-primary, #6366f1)",
                },
              },
              h(glyphs.Search, { size: 13, style: { color: "var(--dsw-alias-label-secondary)" } }),
              h("input", {
                ref: searchInputRef,
                type: "text",
                placeholder: "Search chats, files…",
                value: searchQuery,
                onChange: function (event) {
                  setSearchQuery(event.target.value);
                },
                onKeyDown: function (event) {
                  if (event.key === "Escape") {
                    setSearchQuery("");
                    setSearchExpanded(false);
                  }
                },
                style: {
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--dsw-alias-label-primary)",
                  fontSize: "12px",
                  width: "100%",
                },
              }),
              h(
                "button",
                {
                  type: "button",
                  onClick: function () {
                    setSearchQuery("");
                    setSearchExpanded(false);
                  },
                  style: {
                    background: "transparent",
                    border: "none",
                    color: "var(--dsw-alias-label-tertiary)",
                    cursor: "pointer",
                    fontSize: "12px",
                    padding: 0,
                  },
                },
                "✕",
              ),
            )
          : h(
              "span",
              {
                style: {
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--dsw-alias-label-secondary)",
                },
              },
              "Workspaces",
            ),
        !searchExpanded
          ? h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "2px" } },
              showSearchButton
                ? h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-tree-actionBtn",
                      title: "Search workspaces & chats",
                      "aria-label": "Search",
                      style: {
                        width: "26px",
                        height: "26px",
                        borderRadius: "5px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      },
                      onClick: function () {
                        setSearchExpanded(true);
                        setTimeout(function () {
                          if (searchInputRef.current) searchInputRef.current.focus();
                        }, 50);
                      },
                    },
                    h(glyphs.Search, { size: 14 }),
                  )
                : null,
              h(
                "button",
                {
                  ref: viewOptionsButtonRef,
                  type: "button",
                  className: "dsh-tree-actionBtn",
                  title: "View Options",
                  "aria-label": "View Options",
                  style: {
                    width: "26px",
                    height: "26px",
                    borderRadius: "5px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  onClick: function () {
                    setViewOptionsOpen(!viewOptionsOpen);
                  },
                },
                h(glyphs.Sliders, { size: 14 }),
              ),
              viewOptionsOpen
                ? h(runtime.SelectDropdownMenu, {
                    open: viewOptionsOpen,
                    anchorRef: viewOptionsButtonRef,
                    onClose: function () {
                      setViewOptionsOpen(false);
                    },
                    items: [
                      {
                        id: "archive-empty",
                        label: "Archive Empty & Pong Sessions",
                        icon: h(glyphs.Trash, { size: 13 }),
                        danger: true,
                      },
                    ],
                    onSelect: function (actionId) {
                      setViewOptionsOpen(false);
                      if (actionId === "archive-empty") onArchiveEmptyChats(grouping);
                    },
                  })
                : null,
              renderNewItemMenu(SIDEBAR_TREE_DEFAULT_DIRECTORY, "root-ws", newItemMenuCtx),
            )
          : null,
      );
    }
  }

  return SidebarTree;
}
