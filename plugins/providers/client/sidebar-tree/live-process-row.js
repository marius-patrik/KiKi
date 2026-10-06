/**
 * Rows for the Containers and Terminals groups (#96): a live terminal
 * session or a running container, each now with a context menu wired to the
 * same backend endpoints the rest of the shell uses. Rename and kill/stop
 * surface failures through the tree's existing notice path instead of
 * resolving silently (#98, #226).
 *
 * @module @dsh-stack/providers/client/sidebar-tree/live-process-row
 */

/**
 * Build the live-process row renderer bound to one runtime.
 * @param runtime - `{ React, h, glyphs, SelectDropdownMenu }`.
 * @returns `{ renderTerminalRow, renderContainerRow }`.
 */
function __dshCreateLiveProcessRow(runtime) {
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var renderRowActionsMenu = __dshCreateRowActionsMenu(runtime);

  /* jscpd:ignore-start -- every row kind uses the same tiny right-click handler and ellipsis-trigger props; extracting cross-file would add a new file for a few lines without changing the bundle. */
  /**
   * Opens a context menu at the cursor position.
   * @param openMenu - the row's `openMenu(pos)` closure.
   * @returns the `onContextMenu` handler.
   */
  function rowContextMenuHandler(openMenu) {
    return function (event) {
      event.preventDefault();
      event.stopPropagation();
      openMenu({ x: event.clientX, y: event.clientY });
    };
  }

  /**
   * Shared trigger props for a live-process row's ellipsis menu.
   * @param ctx - the row's context.
   * @param menuId - this row's unique menu id.
   * @returns `{ isOpen, position, onToggle, onClose }`.
   */
  function ellipsisTriggerProps(ctx, menuId) {
    var isOpen = Boolean(ctx.ellipsisOpen && ctx.ellipsisOpen.id === menuId);
    var pos = ctx.ellipsisOpen && ctx.ellipsisOpen.id === menuId ? ctx.ellipsisOpen.pos : null;
    return {
      isOpen: isOpen,
      position: pos,
      onToggle: function () {
        if (isOpen) ctx.setEllipsisOpen(null);
        else ctx.setEllipsisOpen({ id: menuId, pos: undefined });
      },
      onClose: function () {
        ctx.setEllipsisOpen(null);
      },
    };
  }
  /* jscpd:ignore-end */

  /** Reports a live-process action failure through the tree's notice path. */
  function reportActionFailure(ctx, action, error) {
    ctx.onActionFailure({
      action: action,
      message: (error && error.message) || action + " failed.",
    });
  }

  /** Parses a JSON response and throws if the server reported an error. */
  function parseActionResponse(response) {
    return response.json().then(function (body) {
      if (body && body.error) throw new Error(body.error);
      return body;
    });
  }

  /** POSTs to a backend path and refreshes the live list, surfacing errors. */
  function postAndRefresh(ctx, action, path, payload) {
    return fetch(ctx.quotasApiBase + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(parseActionResponse)
      .then(ctx.loadAll)
      .catch(function (error) {
        reportActionFailure(ctx, action, error);
      });
  }

  /** The shared "alive" status dot both row kinds show. */
  function renderStatusDot() {
    return h("span", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "#3fb950",
        flexShrink: 0,
        boxShadow: "0 0 5px rgba(63, 185, 80, 0.5)",
      },
    });
  }

  /**
   * Renders the ellipsis actions menu for a live-process row.
   * @param ctx - the row's context.
   * @param menuId - this row's unique menu id.
   * @param title - the trigger button's title.
   * @param items - the dropdown menu items.
   * @param onSelect - the item selection handler.
   * @returns the menu elements.
   */
  function renderLiveProcessActionsMenu(ctx, menuId, title, items, onSelect) {
    return h(
      "span",
      { className: "dsh-tree-actions" },
      renderRowActionsMenu(
        Object.assign({ title: title }, ellipsisTriggerProps(ctx, menuId), {
          items: items,
          onSelect: onSelect,
        }),
      ),
    );
  }

  return {
    /**
     * Renders one live terminal session row.
     * @param session - `{ name }` from the tmux sessions poll.
     * @param ctx - `{ quotasApiBase, ellipsisOpen, setEllipsisOpen,
     * onActionFailure, loadAll }`.
     * @returns the row element.
     */
    renderTerminalRow: function (session, ctx) {
      var menuId = "terminal::" + session.name;

      /** Opens this terminal's context menu at the given position. */
      function openMenu(pos) {
        ctx.setEllipsisOpen({ id: menuId, pos: pos });
      }

      /** Prompts for a new name and posts the tmux rename endpoint. */
      function renameTerminal() {
        var currentName = session.name;
        var newName = prompt("Rename terminal session:", currentName);
        if (!newName || newName.trim() === currentName) return;
        return postAndRefresh(ctx, "Rename", "/tmux/sessions/rename", {
          oldName: currentName,
          newName: newName.trim(),
        });
      }

      /** Confirms then posts the tmux kill endpoint. */
      function killTerminal() {
        if (!confirm("Kill terminal session '" + session.name + "'?")) return;
        return postAndRefresh(ctx, "Kill", "/tmux/sessions/kill", { name: session.name });
      }

      return h(
        "div",
        {
          key: "live-term::" + session.name,
          className: "dsh-tree-sessionRow",
          role: "treeitem",
          style: { paddingLeft: "16px", height: "28px", cursor: "pointer", position: "relative" },
          onClick: function () {
            window.dispatchEvent(
              new CustomEvent("dsh:open-terminal", { detail: { session: session.name } }),
            );
          },
          onContextMenu: rowContextMenuHandler(openMenu),
        },
        h(
          "span",
          {
            className: "dsh-tree-slot dsh-tree-icon",
            style: { color: "var(--dsw-alias-primary, #6366f1)" },
          },
          h(glyphs.Terminals, { size: 13 }),
        ),
        h(
          "span",
          { className: "dsh-tree-title", style: { fontSize: "12px" } },
          "Terminal: " + session.name,
        ),
        h(
          "span",
          { style: { display: "flex", alignItems: "center", marginLeft: "auto", flexShrink: 0 } },
          renderStatusDot(),
        ),
        renderLiveProcessActionsMenu(
          ctx,
          menuId,
          "Terminal Actions",
          [
            { id: "rename", label: "Rename Terminal", icon: h(glyphs.Edit, { size: 13 }) },
            {
              id: "kill",
              label: "Kill Terminal",
              icon: h(glyphs.Trash, { size: 13 }),
              danger: true,
            },
          ],
          function (actionId) {
            if (actionId === "rename") return renameTerminal();
            else if (actionId === "kill") return killTerminal();
          },
        ),
      );
    },
    /**
     * Renders one running container row.
     * @param container - `{ id, name, image }` from the docker containers poll.
     * @param ctx - `{ quotasApiBase, ellipsisOpen, setEllipsisOpen,
     * onActionFailure, loadAll }`.
     * @returns the row element.
     */
    renderContainerRow: function (container, ctx) {
      var menuId = "container::" + container.id;
      var label = container.name || container.image || container.id.slice(0, 12);

      /** Opens this container's context menu at the given position. */
      function openMenu(pos) {
        ctx.setEllipsisOpen({ id: menuId, pos: pos });
      }

      /** Confirms then posts the docker action endpoint for the given action. */
      function runContainerAction(action, label) {
        if (!confirm(label + " container '" + (container.name || container.id.slice(0, 12)) + "'?"))
          return;
        return postAndRefresh(ctx, label, "/docker/containers/action", {
          id: container.id,
          action: action,
        });
      }

      return h(
        "div",
        {
          key: "live-cont::" + container.id,
          className: "dsh-tree-sessionRow",
          role: "treeitem",
          style: { paddingLeft: "16px", height: "28px", cursor: "pointer", position: "relative" },
          onClick: function () {
            window.dispatchEvent(
              new CustomEvent("dsh:open-container", { detail: { id: container.id } }),
            );
          },
          onContextMenu: rowContextMenuHandler(openMenu),
        },
        h(
          "span",
          {
            className: "dsh-tree-slot dsh-tree-icon",
            style: { color: "var(--dsw-alias-primary, #6366f1)" },
          },
          h(glyphs.Containers, { size: 13 }),
        ),
        h(
          "span",
          { className: "dsh-tree-title", style: { fontSize: "12px" } },
          "Container: " + label,
        ),
        h(
          "span",
          { style: { display: "flex", alignItems: "center", marginLeft: "auto", flexShrink: 0 } },
          renderStatusDot(),
        ),
        renderLiveProcessActionsMenu(
          ctx,
          menuId,
          "Container Actions",
          [
            {
              id: "stop",
              label: "Stop Container",
              icon: h(glyphs.Trash, { size: 13 }),
              danger: true,
            },
            {
              id: "remove",
              label: "Remove Container",
              icon: h(glyphs.Trash, { size: 13 }),
              danger: true,
            },
          ],
          function (actionId) {
            if (actionId === "stop") return runContainerAction("stop", "Stop");
            else if (actionId === "remove") return runContainerAction("rm", "Remove");
          },
        ),
      );
    },
  };
}
