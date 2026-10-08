/**
 * The sidebar tree's collapsed-rail view: four icon buttons (search, new
 * item, terminals/sandboxes, workspaces explorer) shown when the sidebar is
 * narrow (`!props.wide`), in place of the full tree.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/collapsed-rail
 */

/**
 * Build the collapsed-rail renderer bound to one runtime.
 * @param runtime - `{ React, h, glyphs, SelectDropdownMenu }`.
 * @returns the render function.
 */
function __dshCreateCollapsedRail(runtime) {
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var SelectDropdownMenu = runtime.SelectDropdownMenu;

  /**
   * Renders the collapsed rail.
   * @param ctx - `{ showSearchButton, handleExpand, setSearchExpanded,
   * searchInputRef, plusMenu, setPlusMenu, railPlusButtonRef, totalLive,
   * firstTerminalName, onCreateChat, onCreateTerminal, onCreateContainer,
   * onOpenWorkspace }`.
   * @returns the rail element.
   */
  return function renderCollapsedRail(ctx) {
    var isRailPlusOpen = Boolean(
      ctx.plusMenu === "rail" || (ctx.plusMenu && ctx.plusMenu.key === "rail"),
    );

    return h(
      "div",
      {
        className: "dsh-collapsed-rail",
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          width: "100%",
          height: "100%",
          paddingTop: "4px",
          position: "relative",
        },
      },
      ctx.showSearchButton
        ? h(
            "button",
            {
              type: "button",
              className: "dsh-tree-actionBtn dsh-rail-btn",
              title: "Search workspaces & chats",
              "aria-label": "Search",
              style: railButtonStyle(),
              onClick: function (event) {
                ctx.handleExpand(event);
                setTimeout(function () {
                  ctx.setSearchExpanded(true);
                  if (ctx.searchInputRef.current) ctx.searchInputRef.current.focus();
                }, 150);
              },
            },
            h(glyphs.Search, { size: 16, className: "dsh-icon-search dsh-icon-animated" }),
          )
        : null,

      h(
        "div",
        { style: { position: "relative" } },
        h(
          "button",
          {
            ref: ctx.railPlusButtonRef,
            type: "button",
            className: "dsh-tree-actionBtn dsh-rail-btn",
            title: "New Item (+)",
            "aria-label": "New Item",
            style: railButtonStyle(),
            onClick: function (event) {
              event.stopPropagation();
              var rect = event.currentTarget.getBoundingClientRect();
              var isSwapped =
                typeof document !== "undefined" &&
                document.body.classList.contains("dsh-main-sidebar-right");
              var posX = isSwapped ? rect.left - 194 : rect.right + 4;
              var posY = rect.top;
              ctx.setPlusMenu(
                isRailPlusOpen
                  ? null
                  : { key: "rail", pos: { x: Math.max(8, posX), y: Math.max(8, posY) } },
              );
            },
          },
          h(glyphs.Plus, { size: 16, className: "dsh-icon-plus dsh-icon-animated" }),
        ),
        isRailPlusOpen
          ? h(SelectDropdownMenu, {
              open: true,
              position: ctx.plusMenu && ctx.plusMenu.pos ? ctx.plusMenu.pos : null,
              anchorRef: ctx.railPlusButtonRef,
              onClose: function () {
                ctx.setPlusMenu(null);
              },
              items: __dshNewSessionMenuItems(h, glyphs).concat([
                {
                  id: "open-workspace",
                  label: "Open Workspace…",
                  icon: h(glyphs.BlueFolder, { size: 13 }),
                },
              ]),
              onSelect: function (actionId) {
                ctx.setPlusMenu(null);
                if (actionId === "chat") ctx.onCreateChat();
                else if (actionId === "terminal") ctx.onCreateTerminal();
                else if (actionId === "container") ctx.onCreateContainer();
                else if (actionId === "open-workspace") ctx.handleExpand();
              },
            })
          : null,
      ),

      h(
        "button",
        {
          type: "button",
          className: "dsh-tree-actionBtn dsh-rail-btn",
          title:
            ctx.totalLive > 0
              ? "Active processes (" + ctx.totalLive + ")"
              : "Terminals & Sandboxes",
          "aria-label": "Terminals & Sandboxes",
          style: Object.assign({ position: "relative" }, railButtonStyle()),
          onClick: function () {
            window.dispatchEvent(
              new CustomEvent("dsh:open-terminal", {
                detail: { session: ctx.firstTerminalName || "0" },
              }),
            );
          },
        },
        h(glyphs.Terminals, { size: 16, className: "dsh-icon-terminal dsh-icon-animated" }),
        ctx.totalLive > 0
          ? h("span", {
              style: {
                position: "absolute",
                top: "6px",
                right: "6px",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#3fb950",
                boxShadow: "0 0 4px #3fb950",
              },
            })
          : null,
      ),

      h(
        "button",
        {
          type: "button",
          className: "dsh-tree-actionBtn dsh-rail-btn",
          title: "Workspaces Explorer",
          "aria-label": "Workspaces Explorer",
          style: railButtonStyle(),
          onClick: ctx.handleExpand,
        },
        h(glyphs.BlueFolder, { size: 16, className: "dsh-icon-folder dsh-icon-animated" }),
      ),
    );
  };

  /** The style every rail icon button shares. */
  function railButtonStyle() {
    return {
      width: "34px",
      height: "34px",
      borderRadius: "8px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--dsw-alias-label-primary, #ffffff)",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      transition: "background 120ms ease",
    };
  }
}
