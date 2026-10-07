/**
 * The main area's tab bar: the fixed header strip holding conversation,
 * terminal, container, file, and repo tabs, its per-row context menu and "…"
 * overflow menu (this area's per-area context menu — chat/trajectory view
 * toggle, session log download, move/close), the empty-area fallback, and
 * the occupant each tab type renders into the main area body.
 *
 * Both its overflow menu and its per-row context menu previously built their
 * own near-identical "Move Tab to Bottom Panel" / "Move Tab to Secondary
 * Sidebar" item lists, and both removed the tab from this bar's own list
 * (via `removeTab`) *before* dispatching the move-request event, instead of
 * requesting the move and letting the destination's commit drive removal.
 * Neither menu excluded the conversation tab from those items, so selecting
 * "Move Tab to Bottom Panel" on the conversation tab would have removed it
 * here, then had the request refused by every destination (only the main
 * area can host a chat tab) — destroying the open conversation with no
 * destination ever taking ownership of it. That is the exact failure mode
 * #122 fixed for the drag-and-drop path; this call site had not been
 * migrated onto the protocol. Both menus now go through the shared
 * `tabMoveMenu` (client-tab-move-menu.js), which only offers destinations
 * that can host the tab and never removes locally.
 *
 * This file is prepended (via the package build script, alongside
 * client-tab-move-protocol.js, client-tab-move-menu.js and
 * client-empty-area-new-tab-picker.js) ahead of client.js. Kept
 * framework-free and classic-script compatible (no import/export) for the
 * same reason as those files.
 */

/**
 * Creates the TopConversationTabBar component bound to React, `h`
 * (React.createElement), the tab-move protocol (`tabMove`), the shared move
 * menu (`tabMoveMenu`), `useCenterBounds`, the glyph and menu components it
 * renders, and the occupant components each active tab type mounts into the
 * main area body.
 */
function __dshCreateMainAreaTabBar(deps) {
  var React = deps.React;
  var h = deps.h;
  var tabMove = deps.tabMove;
  var tabMoveMenu = deps.tabMoveMenu;
  var tabTypeGlyph = deps.tabTypeGlyph;
  var useCenterBounds = deps.useCenterBounds;
  var ChatGlyph = deps.ChatGlyph;
  var PanelBottomGlyph = deps.PanelBottomGlyph;
  var PanelRightGlyph = deps.PanelRightGlyph;
  var EllipsisGlyph = deps.EllipsisGlyph;
  var FolderOpenGlyph = deps.FolderOpenGlyph;
  var TrashGlyph = deps.TrashGlyph;
  var SelectDropdownMenu = deps.SelectDropdownMenu;
  var EmptyAreaNewTabPicker = deps.EmptyAreaNewTabPicker;
  var MainViewTerminalOccupant = deps.MainViewTerminalOccupant;
  var MainViewContainerOccupant = deps.MainViewContainerOccupant;
  var MainViewFileEditorOccupant = deps.MainViewFileEditorOccupant;
  var MainViewRepoOccupant = deps.MainViewRepoOccupant;
  var PANEL_TOGGLE_BUTTON_STYLE = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: "5px",
    border: "none",
    background: "transparent",
    color: "var(--dsw-alias-label-secondary)",
    cursor: "pointer",
  };

  /**
   * Renders one header icon-button that toggles a shell surface (the bottom
   * panel or the secondary sidebar) via a CustomEvent.
   */
  function renderPanelToggleButton(opts) {
    return h(
      "button",
      {
        type: "button",
        className: "dsh-tree-actionBtn",
        title: opts.title,
        "aria-label": opts.ariaLabel,
        onClick: function () {
          window.dispatchEvent(new CustomEvent(opts.eventName));
        },
        style: PANEL_TOGGLE_BUTTON_STYLE,
      },
      h(opts.Glyph, { size: 15 }),
    );
  }

  /** The main area's tab bar, its menus, and the active tab's occupant. */
  function TopConversationTabBar(props) {
    var topPlusBtnRef = React.useRef(null);
    var plusOpenState = React.useState(false);
    var plusOpen = plusOpenState[0],
      setPlusOpen = plusOpenState[1];

    var topEllipsisBtnRef = React.useRef(null);
    var topMenuOpenState = React.useState(false);
    var isTopMenuOpen = topMenuOpenState[0],
      setTopMenuOpen = topMenuOpenState[1];

    var tabsState = React.useState([
      {
        id: "chat-main",
        type: "chat",
        title:
          typeof window !== "undefined" && window.__dsh_current_session_title__
            ? window.__dsh_current_session_title__
            : "Conversation",
      },
    ]);
    var tabs = tabsState[0],
      setTabs = tabsState[1];
    var activeTabState = React.useState("chat-main");
    var activeTab = activeTabState[0],
      setActiveTab = activeTabState[1];

    var contextMenuState = React.useState(null); // { tabId, anchorEl }
    var contextMenu = contextMenuState[0],
      setContextMenu = contextMenuState[1];

    // Shared "add if absent, then activate" / "remove by id" tab-list
    // actions: see client-tab-list-actions.js.
    var tabListActions = __dshCreateTabListActions({
      setTabs: setTabs,
      setActiveTab: setActiveTab,
    });
    var addTabIfAbsentAndActivate = tabListActions.addTabIfAbsentAndActivate;

    // Sync active top tab IDs to window global for cross-panel deduplication
    React.useEffect(
      function () {
        if (typeof window !== "undefined") {
          var map = {};
          tabs.forEach(function (t) {
            map[t.id] = true;
            if (t.session) map[t.session] = true;
          });
          window.__dsh_top_tab_ids__ = map;
          window.dispatchEvent(new CustomEvent("dsh:tabs-changed"));
        }
      },
      [tabs],
    );

    // Sync live chat title from active session or document
    React.useEffect(function () {
      var /** updateTitle implementation. */
        updateTitle = function () {
          var title =
            typeof window !== "undefined" && window.__dsh_current_session_title__
              ? window.__dsh_current_session_title__
              : null;
          if (!title && typeof document !== "undefined") {
            var activeSessionRow = document.querySelector(
              ".dsh-tree-sessionRowActive .dsh-tree-sessionTitle, .dsh-tree-sessionRowActive .dsh-tree-title",
            );
            if (activeSessionRow && activeSessionRow.textContent) {
              title = activeSessionRow.textContent.trim();
            }
          }
          if (title) {
            setTabs(function (prev) {
              return prev.map(function (t) {
                if (t.id === "chat-main" || t.type === "chat") {
                  if (t.title !== title) return Object.assign({}, t, { title: title });
                }
                return t;
              });
            });
          }
        };
      updateTitle();
      var timer = setInterval(updateTitle, 500);
      return function () {
        clearInterval(timer);
      };
    }, []);

    React.useEffect(function () {
      /**
       * Adds a tab opened elsewhere (a file from the diff view, a repo from
       * the repo picker) to the strip, if it isn't already present, and
       * selects it. Shared by dsh:open-file-tab and dsh:open-repo-tab: both
       * events carry a ready-made tab object and differ only in which
       * event name delivers it.
       */
      var onOpenExternalTab = function (e) {
        var tab = e.detail;
        if (!tab) return;
        addTabIfAbsentAndActivate(tab);
      };

      /** Adds a main-area terminal tab when a terminal is opened targeting "top". */
      var onOpenTerminal = function (e) {
        var target = (e && e.detail && e.detail.target) || "bottom";
        if (target === "top") {
          var sess = (e && e.detail && e.detail.session) || "0";
          addTabIfAbsentAndActivate({
            id: sess,
            type: "terminal",
            title: "Terminal: " + sess,
            session: sess,
          });
        }
      };

      /** Adds a main-area container tab when a container is opened targeting "top". */
      var onOpenContainer = function (e) {
        var target = (e && e.detail && e.detail.target) || "bottom";
        if (target === "top") {
          var cId = (e && e.detail && e.detail.id) || "container-sandboxes";
          addTabIfAbsentAndActivate({
            id: cId,
            type: "container",
            title:
              (e && e.detail && e.detail.title) ||
              (cId === "container-sandboxes"
                ? "Docker Sandboxes"
                : "Container: " + cId.slice(0, 8)),
          });
        }
      };

      /** Focuses (or re-adds) the conversation tab, refreshing its title. */
      var onFocusChat = function (e) {
        var tTitle =
          (e && e.detail && e.detail.title) ||
          (typeof window !== "undefined" && window.__dsh_current_session_title__) ||
          "Conversation";
        var chatTab = { id: "chat-main", type: "chat", title: tTitle };
        setTabs(function (prev) {
          var exists = prev.find(function (t) {
            return t.id === "chat-main" || t.type === "chat";
          });
          if (exists) {
            return prev.map(function (t) {
              if (t.id === "chat-main" || t.type === "chat") {
                return Object.assign({}, t, { title: tTitle });
              }
              return t;
            });
          }
          return [chatTab].concat(prev);
        });
        setActiveTab("chat-main");
      };

      /** Drops a main-area terminal tab when its underlying session closes. */
      var onCloseTerminalTab = function (e) {
        var sess = e && e.detail ? e.detail.session || e.detail.id : null;
        if (!sess) return;
        setTabs(function (prev) {
          var tabToRemove = prev.find(function (t) {
            return t.type === "terminal" && (t.session === sess || t.id === sess);
          });
          if (tabToRemove) {
            var idx = prev.findIndex(function (t) {
              return t.id === tabToRemove.id;
            });
            var remaining = prev.filter(function (t) {
              return t.id !== tabToRemove.id;
            });
            setActiveTab(function (cur) {
              if (cur === tabToRemove.id) {
                return remaining.length > 0
                  ? remaining[Math.min(idx, remaining.length - 1)].id
                  : "chat-main";
              }
              return cur;
            });
            return remaining;
          }
          return prev;
        });
      };

      window.addEventListener("dsh:open-file-tab", onOpenExternalTab);
      window.addEventListener("dsh:open-repo-tab", onOpenExternalTab);
      window.addEventListener("dsh:open-terminal", onOpenTerminal);
      window.addEventListener("dsh:open-container", onOpenContainer);
      window.addEventListener("dsh:focus-chat", onFocusChat);
      window.addEventListener("dsh:close-terminal-tab", onCloseTerminalTab);
      return function () {
        window.removeEventListener("dsh:open-file-tab", onOpenExternalTab);
        window.removeEventListener("dsh:open-repo-tab", onOpenExternalTab);
        window.removeEventListener("dsh:open-terminal", onOpenTerminal);
        window.removeEventListener("dsh:open-container", onOpenContainer);
        window.removeEventListener("dsh:focus-chat", onFocusChat);
        window.removeEventListener("dsh:close-terminal-tab", onCloseTerminalTab);
      };
    }, []);

    // A tab the main area holds has been committed to another surface
    // (bottom panel or secondary sidebar): drop it from the strip. Removal
    // is commit-driven — a move request no destination accepted leaves the
    // main area's copy untouched (#122).
    React.useEffect(function () {
      return tabMove.onForeignCommit("top", function (detail) {
        var committedId = detail && detail.id;
        if (!committedId) return;
        tabListActions.removeTabById(committedId);
        setActiveTab(function (curr) {
          if (curr === committedId) return null;
          return curr;
        });
      });
    }, []);

    // Destination-side: a move to the main area was requested. The main
    // area hosts every tab type (surfaceHostsTab returns true for "top"),
    // so takeOwnership only fails when the tab itself is malformed. On
    // success, add the tab here and select it -- the commit this fires is
    // what tells the source (panel or sidebar) to drop its own copy, never
    // before (#122).
    React.useEffect(function () {
      return tabMove.onMoveRequested("top", function (tab) {
        if (!tabMove.takeOwnership("top", tab)) return;
        addTabIfAbsentAndActivate(tab);
      });
    }, []);

    /** Accepts a tab dropped on the main area's header via drag-and-drop. */
    var handleDropOnTop = function (e) {
      e.preventDefault();
      try {
        var raw = e.dataTransfer.getData("text/dsh-tab");
        if (raw) {
          var tabData = JSON.parse(raw);
          tabMove.requestMove("top", tabData);
        }
      } catch (err) {}
    };

    /**
     * Removes the specified tab from the tab interface.
     *
     * The caller must guarantee that the tab to be removed is valid and exists.
     * The function returns `true` if the tab was successfully removed, and `false` if it did not exist.
     */
    var removeTab = function (tabId, e) {
      if (e) e.stopPropagation();
      setTabs(function (prev) {
        var idx = prev.findIndex(function (t) {
          return t.id === tabId;
        });
        var remaining = prev.filter(function (t) {
          return t.id !== tabId;
        });
        if (activeTab === tabId) {
          if (remaining.length > 0) {
            var nextIdx = Math.min(idx, remaining.length - 1);
            setActiveTab(remaining[nextIdx].id);
          } else {
            setActiveTab(null);
          }
        }
        return remaining;
      });
    };

    /**
     * Checks if the provided trajectory text contains any changes.
     *
     * Returns true if the trajectory text indicates changes (additions or deletions),
     * otherwise returns false. Ignores lines starting with "+++" or "---".
     *
     * @returns {boolean} - true if there are changes, false otherwise.
     */
    var checkIsTrajectory = function () {
      var activeTabEl = document.querySelector('[role="tab"][aria-selected="true"]');
      if (activeTabEl) {
        var txt = (activeTabEl.textContent || "").trim().toLowerCase();
        return (
          txt === "trajectory" ||
          txt.includes("trajectory") ||
          txt === "轨迹" ||
          txt.includes("轨迹")
        );
      }
      return Boolean(
        document.querySelector(
          '[class*="TrajectoryView"], [class*="trajectoryView"], [aria-label*="Trajectory"]',
        ),
      );
    };

    /**
     * Sets the view mode based on the active tab.
     *
     * Guarantees the view mode to be updated according to the active tab ("history" or another).
     * Returns `null` if the active tab is not "history".
     * Fails silently if the active tab is not recognized.
     */
    var handleToggleView = function () {
      var onTrajectoryNow = checkIsTrajectory();
      var targetName = onTrajectoryNow ? "chat" : "trajectory";
      var allTabs = Array.from(document.querySelectorAll('[role="tab"], [role="tablist"] button'));
      var targetBtn = allTabs.find(function (b) {
        var t = (b.textContent || "").trim().toLowerCase();
        return (
          (targetName === "chat" &&
            (t === "chat" || t.includes("chat") || t === "对话" || t.includes("对话"))) ||
          (targetName === "trajectory" &&
            (t === "trajectory" || t.includes("trajectory") || t === "轨迹" || t.includes("轨迹")))
        );
      });
      if (targetBtn) {
        targetBtn.click();
      } else {
        var inactiveBtn = allTabs.find(function (b) {
          return b.getAttribute("aria-selected") !== "true";
        });
        if (inactiveBtn) inactiveBtn.click();
      }
    };

    /** Downloads the active session's trajectory log as a .jsonl file. */
    var handleDownloadSessionLog = function () {
      try {
        var activeSessId =
          typeof window !== "undefined" && window.__dsh_current_session_id__
            ? window.__dsh_current_session_id__
            : "";
        var exportUrl = "/api/session.export?id=" + encodeURIComponent(activeSessId || "");
        var a = document.createElement("a");
        a.href = exportUrl;
        a.download = (activeSessId || "session") + ".jsonl";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1000);
      } catch (e) {}
    };

    var bounds = useCenterBounds();
    var activeTabObj = tabs.find(function (t) {
      return t.id === activeTab;
    });
    var isMainTermActive = activeTabObj && activeTabObj.type === "terminal";
    var isMainContActive = activeTabObj && activeTabObj.type === "container";
    var isMainFileActive = activeTabObj && activeTabObj.type === "file";
    var isMainRepoActive = activeTabObj && activeTabObj.type === "repo";
    var isMainEmpty = tabs.length === 0;

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          className: "dsh-top-conversation-header",
          style: {
            position: "fixed",
            top: bounds.top + "px",
            left: bounds.left + "px",
            right: bounds.right + "px",
            height: "36px",
            background: "var(--dsw-alias-surface-l0, #13141f)",
            borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 8px 0 12px",
            userSelect: "none",
          },
          onDragOver: function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          },
          onDrop: handleDropOnTop,
        },
        // Left Tabs List
        h(
          "div",
          {
            className: "dsh-top-tab-list",
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              overflowX: "auto",
              scrollbarWidth: "none",
              maxWidth: "calc(100% - 130px)",
            },
          },
          tabs.map(function (t) {
            var isSel = activeTab === t.id;
            var icon = tabTypeGlyph(t, 12);

            return h(
              "div",
              {
                key: t.id,
                draggable: true,
                role: "tab",
                "aria-selected": isSel,
                onClick: function () {
                  setActiveTab(t.id);
                },
                onDragStart: function (e) {
                  e.dataTransfer.setData("text/dsh-tab", JSON.stringify(t));
                },
                onContextMenu: function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ tab: t, pos: { x: e.clientX, y: e.clientY } });
                },
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 8px",
                  borderRadius: "5px",
                  background: isSel
                    ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.18))"
                    : "transparent",
                  border: isSel
                    ? "1px solid var(--dsw-alias-primary, #6366f1)"
                    : "1px solid transparent",
                  color: isSel
                    ? "var(--dsw-alias-label-primary, #fff)"
                    : "var(--dsw-alias-label-secondary, #8b949e)",
                  fontSize: "12px",
                  fontWeight: isSel ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 120ms ease",
                  maxWidth: "200px",
                },
              },
              icon,
              h(
                "span",
                { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                t.title || "Tab",
              ),
              t.type !== "chat" && t.id !== "chat-main"
                ? h(
                    "button",
                    {
                      type: "button",
                      title: "Close Tab",
                      onClick: function (e) {
                        removeTab(t.id, e);
                      },
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "14px",
                        height: "14px",
                        marginLeft: "2px",
                        border: "none",
                        borderRadius: "3px",
                        background: "transparent",
                        color: "inherit",
                        opacity: 0.6,
                        cursor: "pointer",
                        fontSize: "12px",
                      },
                      onMouseEnter: function (e) {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "#f85149";
                      },
                      onMouseLeave: function (e) {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.color = "inherit";
                      },
                    },
                    "×",
                  )
                : null,
            );
          }),
        ),
        // Right Controls: Bottom Panel Toggle, Secondary Sidebar Toggle, 3-dots Menu
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "3px" } },
          // 1. Bottom Panel Toggle
          renderPanelToggleButton({
            title: "Toggle Bottom Panel (Cmd+J / Ctrl+J)",
            ariaLabel: "Toggle Bottom Panel",
            eventName: "dsh:toggle-bottom-panel",
            Glyph: PanelBottomGlyph,
          }),
          // 2. Secondary Sidebar Toggle
          renderPanelToggleButton({
            title: "Toggle Secondary Sidebar (Cmd+Opt+B / Ctrl+Alt+B)",
            ariaLabel: "Toggle Secondary Sidebar",
            eventName: "dsh:toggle-secondary-sidebar",
            Glyph: PanelRightGlyph,
          }),
          // 3. Three-Dots Menu
          h(
            "div",
            { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
            h(
              "button",
              {
                ref: topEllipsisBtnRef,
                type: "button",
                title: "Main Area Options (…)",
                onClick: function (e) {
                  e.stopPropagation();
                  setTopMenuOpen(!isTopMenuOpen);
                },
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "var(--dsw-alias-label-secondary)",
                  cursor: "pointer",
                },
                onMouseEnter: function (e) {
                  e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
                },
                onMouseLeave: function (e) {
                  e.currentTarget.style.background = "transparent";
                },
              },
              h(EllipsisGlyph, { size: 14 }),
            ),
            h(SelectDropdownMenu, {
              open: isTopMenuOpen,
              anchorRef: topEllipsisBtnRef,
              onClose: function () {
                setTopMenuOpen(false);
              },
              items: [
                {
                  id: "toggle-view",
                  label: checkIsTrajectory() ? "Switch to Chat View" : "Switch to Trajectory View",
                  icon: h(ChatGlyph, { size: 13 }),
                },
                {
                  id: "download-log",
                  label: "Download Session Log",
                  icon: h(FolderOpenGlyph, { size: 13 }),
                },
              ].concat(
                tabMoveMenu.buildMoveMenuItems({
                  tab: activeTabObj,
                  destinations: ["bottom", "right"],
                  closeLabel: "Close Active Tab",
                }),
              ),
              onSelect: function (act) {
                setTopMenuOpen(false);
                if (act === "toggle-view") {
                  handleToggleView();
                } else if (act === "download-log") {
                  handleDownloadSessionLog();
                } else {
                  tabMoveMenu.handleMoveMenuSelect(act, activeTabObj, function (tab) {
                    removeTab(tab.id);
                  });
                }
              },
            }),
          ),
        ),
        contextMenu
          ? h(SelectDropdownMenu, {
              open: true,
              position: contextMenu.pos,
              onClose: function () {
                setContextMenu(null);
              },
              items: tabMoveMenu.buildMoveMenuItems({
                tab: contextMenu.tab,
                destinations: ["bottom", "right"],
              }),
              onSelect: function (act) {
                var tab = contextMenu.tab;
                setContextMenu(null);
                tabMoveMenu.handleMoveMenuSelect(act, tab, function (t) {
                  removeTab(t.id);
                });
              },
            })
          : null,
      ),
      isMainEmpty
        ? h(
            "div",
            {
              style: {
                position: "fixed",
                top: bounds.top + 36 + "px",
                left: bounds.left + "px",
                right: bounds.right + "px",
                bottom:
                  typeof window !== "undefined" && window.__dsh_panel_height__
                    ? window.__dsh_panel_height__
                    : "38px",
                zIndex: 40,
                display: "flex",
              },
            },
            h(EmptyAreaNewTabPicker, null),
          )
        : null,
      isMainTermActive
        ? h(MainViewTerminalOccupant, {
            sessionName: activeTabObj.session || activeTabObj.id,
            onClose: function () {
              removeTab(activeTabObj.id);
            },
          })
        : null,
      isMainContActive
        ? h(MainViewContainerOccupant, {
            onClose: function () {
              removeTab(activeTabObj.id);
            },
          })
        : null,
      isMainFileActive
        ? h(MainViewFileEditorOccupant, {
            filePath: activeTabObj.path,
            fileName: activeTabObj.title,
            onClose: function () {
              removeTab(activeTabObj.id);
            },
          })
        : null,
      isMainRepoActive
        ? h(MainViewRepoOccupant, {
            repoPath: activeTabObj.path,
            repoName: activeTabObj.title,
            onClose: function () {
              removeTab(activeTabObj.id);
            },
          })
        : null,
    );
  }

  return TopConversationTabBar;
}
