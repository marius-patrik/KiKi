/**
 * The secondary sidebar's tab dock: a collapsible, resizable strip on the
 * shell's right edge holding terminal and container tabs, with a tab strip,
 * a "…" actions menu (this area's per-area context menu — move/close/
 * collapse), and the body for whichever tab is active.
 *
 * Its move-tab menu previously removed the tab from this dock's own list
 * immediately, then dispatched the move-request event directly, bypassing
 * client-tab-move-menu.js's protocol-safe `moveTabTo`. That is the same
 * failure mode #122 fixed elsewhere: a move to a destination that refuses
 * the tab would have removed it here before anything took ownership,
 * destroying it. It never manifested visibly, because every tab this dock
 * can hold is a terminal or container (see the `takeOwnership` check its own
 * `onMoveRequested` listener below already applied on the way in), and both
 * other surfaces accept those types — but the dock's menu code did not
 * enforce that invariant itself, and would have silently lost a tab the day
 * that stopped being true. It now goes through `tabMoveMenu`, the same as
 * every other area's move menu.
 *
 * This file is prepended (via the package build script, alongside
 * client-tab-move-protocol.js, client-tab-move-menu.js and
 * client-empty-area-new-tab-picker.js) ahead of client.js. Kept
 * framework-free and classic-script compatible (no import/export) for the
 * same reason as those files.
 */

/**
 * Creates the RightSidebarDock component bound to React, `h`
 * (React.createElement), the tab-move protocol (`tabMove`), the shared move
 * menu (`tabMoveMenu`, from `__dshCreateTabMoveMenu`), the glyph and menu
 * components it renders, and the tab-body components it hosts.
 */
function __dshCreateSecondarySidebarTabBar(deps) {
  var React = deps.React;
  var h = deps.h;
  var tabMove = deps.tabMove;
  var tabMoveMenu = deps.tabMoveMenu;
  var tabTypeGlyph = deps.tabTypeGlyph;
  var EllipsisGlyph = deps.EllipsisGlyph;
  var DockToggleGlyph = deps.DockToggleGlyph;
  var SelectDropdownMenu = deps.SelectDropdownMenu;
  var EmptyAreaNewTabPicker = deps.EmptyAreaNewTabPicker;
  var InteractiveTmuxTerminal = deps.InteractiveTmuxTerminal;
  var FullPageContainersWorkspace = deps.FullPageContainersWorkspace;

  /** The secondary sidebar's tab dock. */
  function RightSidebarDock(props) {
    var isOpenState = React.useState(false);
    var isOpen = isOpenState[0],
      setIsOpen = isOpenState[1];
    var widthState = React.useState(300);
    var width = widthState[0],
      setWidth = widthState[1];
    var tabsState = React.useState([]);
    var tabs = tabsState[0],
      setTabs = tabsState[1];
    var activeTabState = React.useState(null);
    var activeTab = activeTabState[0],
      setActiveTab = activeTabState[1];
    var isResizingState = React.useState(false);
    var isResizing = isResizingState[0],
      setIsResizing = isResizingState[1];
    var menuOpenState = React.useState(false);
    var isMenuOpen = menuOpenState[0],
      setMenuOpen = menuOpenState[1];
    var menuBtnRef = React.useRef(null);

    // Shared "add if absent, then activate" / "remove by id" tab-list
    // actions: see client-tab-list-actions.js.
    var tabListActions = __dshCreateTabListActions({
      setTabs: setTabs,
      setActiveTab: setActiveTab,
    });

    // Broadcast secondary sidebar width and adjust layout bounds
    React.useEffect(
      function () {
        var currentRightWidth = isOpen && tabs.length > 0 ? width : 0;
        if (typeof window !== "undefined") {
          window.__dsh_right_sidebar_width__ = currentRightWidth;
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty(
              "--dsh-secondary-sidebar-width",
              currentRightWidth + "px",
            );
          }
          window.dispatchEvent(
            new CustomEvent("dsh:right-sidebar-changed", {
              detail: { open: isOpen && tabs.length > 0, width: currentRightWidth },
            }),
          );
        }
      },
      [isOpen, width, tabs.length, isResizing],
    );

    React.useEffect(function () {
      /** Toggles the secondary sidebar open/closed. */
      var onToggle = function () {
        setIsOpen(function (v) {
          return !v;
        });
      };
      window.addEventListener("dsh:toggle-right-sidebar", onToggle);
      window.addEventListener("dsh:toggle-secondary-sidebar", onToggle);
      return function () {
        window.removeEventListener("dsh:toggle-right-sidebar", onToggle);
        window.removeEventListener("dsh:toggle-secondary-sidebar", onToggle);
      };
    }, []);

    // Destination-side: a move to this sidebar was requested. Accept it
    // only when this surface can host the tab's type (takeOwnership checks
    // surfaceHostsTab) — refusing rather than accepting a type it cannot
    // render is the fix for #122. Acceptance both adds the tab here and
    // fires the commit every other surface's onForeignCommit listens for,
    // so the source drops its copy only once this destination has taken
    // ownership, never before.
    React.useEffect(function () {
      return tabMove.onMoveRequested("right", function (tab) {
        if (!tabMove.takeOwnership("right", tab)) return;
        tabListActions.addTabIfAbsentAndActivate(tab);
        setIsOpen(true);
      });
    }, []);

    // A tab this sidebar holds has been committed to another surface (main
    // area or bottom panel): drop it from the strip. Removal is
    // commit-driven — a move request no destination accepted leaves the
    // sidebar's copy untouched (#122).
    React.useEffect(function () {
      return tabMove.onForeignCommit("right", function (detail) {
        var committedId = detail && detail.id;
        if (!committedId) return;
        tabListActions.removeTabById(committedId);
      });
    }, []);

    var /** handleResizeStart implementation. */
      handleResizeStart = function (e) {
        e.preventDefault();
        setIsResizing(true);
        var startX = e.clientX;
        var startW = width;
        var isSwapped =
          typeof document !== "undefined" &&
          document.body.classList.contains("dsh-main-sidebar-right");
        /** Tracks pointer movement to resize the sidebar during a drag. */
        var onMove = function (moveEv) {
          var delta = isSwapped ? moveEv.clientX - startX : startX - moveEv.clientX;
          var nextW = Math.max(180, Math.min(600, startW + delta));
          setWidth(nextW);
        };
        var /** onUp implementation. */
          onUp = function () {
            setIsResizing(false);
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
          };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      };

    if (!isOpen || tabs.length === 0) return null;

    var activeTabObj = tabs.find(function (t) {
      return t.id === activeTab;
    });

    /**
     * Removes `tab` from this dock's own tab list. Local-only removal:
     * closing a tab from this menu never crosses a surface boundary, so it
     * goes straight through setTabs rather than the move protocol (that
     * protocol only governs transfers between areas).
     */
    var closeActiveTab = function (tab) {
      tabListActions.removeTabById(tab.id);
    };

    return h(
      "div",
      {
        className: "dsh-right-sidebar-dock",
        style: {
          position: "fixed",
          top: "48px",
          right: 0,
          bottom: 0,
          width: isOpen ? width + "px" : "36px",
          background: "var(--dsw-alias-bg-layer-0, #000000)",
          borderLeft: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
          zIndex: 85,
          display: "flex",
          flexDirection: "column",
          transition: isResizing ? "none" : "width 150ms ease",
        },
        onDragOver: function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        onDrop: function (e) {
          e.preventDefault();
          try {
            var raw = e.dataTransfer.getData("text/dsh-tab");
            if (raw) {
              var tabData = JSON.parse(raw);
              tabMove.requestMove("right", tabData);
            }
          } catch (err) {}
        },
      },
      // Resize handle on edge
      isOpen
        ? h("div", {
            onPointerDown: handleResizeStart,
            style: {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "-4px",
              width: "8px",
              cursor: "col-resize",
              zIndex: 10,
            },
          })
        : null,
      // Header Tab Strip
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "38px",
            padding: "0 6px",
            background: "var(--dsw-alias-bg-layer-0, #000000)",
            borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
          },
        },
        isOpen
          ? h(
              "div",
              {
                className: "dsh-top-tab-bar",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  overflowX: "auto",
                  scrollbarWidth: "none",
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
                    onClick: function () {
                      setActiveTab(t.id);
                    },
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: isSel
                        ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.2))"
                        : "transparent",
                      border: isSel
                        ? "1px solid var(--dsw-alias-primary, #6366f1)"
                        : "1px solid transparent",
                      color: isSel ? "#fff" : "var(--dsw-alias-label-secondary, #888)",
                      fontSize: "12px",
                      cursor: "pointer",
                    },
                  },
                  icon,
                  h("span", null, t.title || t.id),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: function (e) {
                        e.stopPropagation();
                        closeActiveTab(t);
                      },
                      style: {
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                        padding: "0 2px",
                      },
                    },
                    "×",
                  ),
                );
              }),
            )
          : null,
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "2px" } },
          isOpen
            ? h(
                "div",
                { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
                h(
                  "button",
                  {
                    ref: menuBtnRef,
                    type: "button",
                    onClick: function () {
                      setMenuOpen(!isMenuOpen);
                    },
                    title: "Secondary Sidebar Actions (…)",
                    style: {
                      border: "none",
                      background: "transparent",
                      color: "var(--dsw-alias-label-secondary)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "inline-flex",
                      alignItems: "center",
                    },
                  },
                  h(EllipsisGlyph, { size: 14 }),
                ),
                h(SelectDropdownMenu, {
                  open: isMenuOpen,
                  anchorRef: menuBtnRef,
                  onClose: function () {
                    setMenuOpen(false);
                  },
                  items: tabMoveMenu
                    .buildMoveMenuItems({
                      tab: activeTabObj,
                      destinations: ["top", "bottom"],
                      closeLabel: "Close Active Tab",
                    })
                    .concat([
                      {
                        id: "collapse",
                        label: "Collapse Secondary Sidebar",
                        icon: h(DockToggleGlyph, { size: 13 }),
                      },
                    ]),
                  onSelect: function (act) {
                    setMenuOpen(false);
                    if (act === "collapse") {
                      setIsOpen(false);
                      return;
                    }
                    tabMoveMenu.handleMoveMenuSelect(act, activeTabObj, closeActiveTab);
                  },
                }),
              )
            : null,
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                setIsOpen(!isOpen);
              },
              title: isOpen ? "Collapse Secondary Sidebar" : "Expand Secondary Sidebar",
              style: {
                border: "none",
                background: "transparent",
                color: "var(--dsw-alias-label-secondary)",
                cursor: "pointer",
                padding: "4px",
              },
            },
            h(DockToggleGlyph, {
              size: 14,
              style: { transform: isOpen ? "rotate(180deg)" : "none" },
            }),
          ),
        ),
      ),
      // Body Content
      isOpen
        ? activeTabObj && activeTabObj.type === "terminal"
          ? h(InteractiveTmuxTerminal, { sessionName: activeTabObj.session || activeTabObj.id })
          : activeTabObj && activeTabObj.type === "container"
            ? h(FullPageContainersWorkspace, {})
            : h(EmptyAreaNewTabPicker, null)
        : null,
    );
  }

  return RightSidebarDock;
}
