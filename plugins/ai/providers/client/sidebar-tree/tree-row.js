/**
 * Chat row rendering for the sidebar tree: a running chat (with its
 * subagents and pin/rename/fork/archive menu) and an archived chat (with its
 * restore/rename/delete menu). Both share one row shell and one context-menu
 * pattern -- right-click or the row's ellipsis button opens the same
 * `SelectDropdownMenu`, positioned at the click or at the button.
 *
 * Rename and fork run through the dispatcher from `session-action-dispatch.js`
 * (`ctx.dispatch`), so a request that cannot be serviced reports instead of
 * doing nothing (#98). Archive, restore and delete combine a local
 * pinned/archived bookkeeping step with the network request (see
 * `session-grouping.js`), so they run through `ctx.onArchiveChat` and
 * `ctx.grouping`'s own restore/delete methods instead, with the same
 * failure-surfacing guarantee.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/tree-row
 */

/**
 * Build the chat-row renderers bound to one runtime.
 * @param runtime - `{ React, h, glyphs, SelectDropdownMenu, formatTimeAgo }`.
 * @returns `{ renderChatRow, renderArchivedChatRow }`.
 */
function __dshCreateTreeRow(runtime) {
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var formatTimeAgo = runtime.formatTimeAgo;
  var renderRowActionsMenu = __dshCreateRowActionsMenu(runtime);

  /**
   * A row's right-click handler: every row kind opens its context menu at
   * the click position the same way.
   * @param openMenu - the row's own `openMenu(pos)` closure.
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
   * A chat row's click/right-click pair: click opens the chat, right-click
   * opens its context menu. Every chat-shaped row (live, subagent, archived)
   * wires these the same way.
   * @param ctx - the row's ctx (see `renderChatRow`).
   * @param chatLike - the item this row opens, needing `id`.
   * @param openMenu - the row's own `openMenu(pos)` closure.
   * @param label - the label the row renders, carried to the opened chat.
   * @returns `{ onClick, onContextMenu }`.
   */
  function chatRowOpenHandlers(ctx, chatLike, openMenu, label) {
    return {
      onClick: function () {
        ctx.onOpenChat(chatLike.id, label);
      },
      onContextMenu: rowContextMenuHandler(openMenu),
    };
  }

  /**
   * The `renderRowActionsMenu` props every row kind's ellipsis trigger
   * shares: where the menu opens, and how it opens/closes. A caller adds
   * `title`, `items` and `onSelect` on top of this.
   * @param ctx - the row's ctx (see `renderChatRow`).
   * @param isOpen - whether this row's menu is currently open.
   * @param openMenu - the row's own `openMenu(pos)` closure.
   * @returns `{ isOpen, position, onToggle, onClose }`.
   */
  function ellipsisTriggerProps(ctx, isOpen, openMenu) {
    return {
      isOpen: isOpen,
      position: ctx.ellipsisOpen && ctx.ellipsisOpen.pos ? ctx.ellipsisOpen.pos : null,
      onToggle: function () {
        if (isOpen) ctx.setEllipsisOpen(null);
        else openMenu(undefined);
      },
      onClose: function () {
        ctx.setEllipsisOpen(null);
      },
    };
  }

  /**
   * Prompts for a new title and dispatches a rename if the user confirms.
   * @param session - the session to rename.
   * @param promptLabel - the prompt prefix (e.g. "Rename chat:").
   * @param backfilledTitles - resolved cold titles keyed by session id.
   * @param dispatchRename - the rename dispatcher.
   */
  function promptAndRenameSession(session, promptLabel, backfilledTitles, dispatchRename) {
    var newTitle = prompt(promptLabel, __dshSessionDurableTitle(session, backfilledTitles));
    if (newTitle) dispatchRename(session.id, newTitle);
  }

  /**
   * The small running-state dot a chat row shows in place of its relative
   * time while the session is busy -- the one visible trace #96 leaves of
   * the old "Active" list once a running chat renders only in its normal
   * group.
   */
  function renderRunningDot() {
    return h("span", {
      "aria-label": "Running",
      title: "Running",
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "#3fb950",
        marginRight: "4px",
        flexShrink: 0,
        boxShadow: "0 0 5px rgba(63, 185, 80, 0.5)",
      },
    });
  }

  /**
   * Renders one chat row, its subagents (when expanded) and its context
   * menu.
   * @param chat - the session record.
   * @param padLeft - the row's indent in pixels.
   * @param ctx - `{ currentSessionId, grouping, dispatch, ellipsisOpen,
   * setEllipsisOpen, expandedSubagents, toggleSubagentExpand, onOpenChat,
   * onArchiveChat, backfilledTitles }`.
   * @returns the row element.
   */
  function renderChatRow(chat, padLeft, ctx) {
    var isChatActive = chat.id === ctx.currentSessionId;
    var isMenuOpen = Boolean(ctx.ellipsisOpen && ctx.ellipsisOpen.id === "chat::" + chat.id);
    var subagents = ctx.grouping.getSubagents(chat.id);
    var hasSubagents = subagents.length > 0;
    var isSubExp = Boolean(ctx.expandedSubagents[chat.id]);
    var isPinned = ctx.grouping.isPinnedSession(chat, chat.id);
    var isRunning = ctx.grouping.isRunningSession(chat);
    var label = __dshSessionRowTitle(chat, ctx.backfilledTitles, "Untitled Chat");

    /** Opens the context menu at a click position or at the ellipsis button. */
    function openMenu(pos) {
      ctx.setEllipsisOpen({ id: "chat::" + chat.id, pos: pos });
    }
    var chatOpenHandlers = chatRowOpenHandlers(ctx, chat, openMenu, label);

    return h(
      "div",
      {
        key: "chat-wrapper::" + chat.id,
        style: { display: "flex", flexDirection: "column", width: "100%" },
      },
      h(
        "div",
        {
          key: "chat::" + chat.id,
          className:
            "dsh-tree-sessionRow" +
            (hasSubagents ? " dsh-has-children" : "") +
            (isChatActive ? " dsh-tree-sessionRowActive" : ""),
          role: "treeitem",
          "data-session-id": chat.id,
          "aria-expanded": hasSubagents ? isSubExp : undefined,
          style: {
            paddingLeft: padLeft + "px",
            height: "30px",
            color: isChatActive ? "var(--dsw-alias-primary, #6366f1)" : "inherit",
            fontWeight: isChatActive ? 600 : 400,
            cursor: "pointer",
            position: "relative",
          },
          onClick: chatOpenHandlers.onClick,
          onContextMenu: chatOpenHandlers.onContextMenu,
        },
        h(
          "span",
          {
            className: "dsh-tree-slot dsh-tree-icon",
            style: isPinned ? { color: "var(--dsw-alias-primary, #6366f1)" } : undefined,
          },
          h(isPinned ? glyphs.Pin : glyphs.Chat, { size: isPinned ? 13 : 14 }),
        ),
        hasSubagents
          ? h(
              "span",
              {
                className: "dsh-tree-slot dsh-tree-chevron",
                title: isSubExp ? "Collapse subagents" : "Expand subagents",
                onClick: function (event) {
                  event.preventDefault();
                  event.stopPropagation();
                  ctx.toggleSubagentExpand(chat.id);
                },
              },
              h(glyphs.TriangleRight, {
                className: "dsh-tree-arrow" + (isSubExp ? " dsh-tree-arrowOpen" : ""),
                size: 11,
              }),
            )
          : null,
        h("span", { className: "dsh-tree-title", title: label }, label),
        hasSubagents
          ? h(
              "span",
              {
                style: {
                  padding: "1px 5px",
                  borderRadius: "8px",
                  fontSize: "9.5px",
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "var(--dsw-alias-primary, #6366f1)",
                  fontWeight: 700,
                  marginLeft: "4px",
                  cursor: "pointer",
                },
                title: subagents.length + " subagents (click to toggle)",
                onClick: function (event) {
                  event.preventDefault();
                  event.stopPropagation();
                  ctx.toggleSubagentExpand(chat.id);
                },
              },
              subagents.length,
            )
          : null,
        h(
          "span",
          {
            style: {
              display: "flex",
              alignItems: "center",
              marginLeft: "auto",
              marginRight: "4px",
              flexShrink: 0,
            },
          },
          isRunning ? renderRunningDot() : null,
          h(
            "span",
            { style: { fontSize: "10.5px", color: "var(--dsw-alias-label-tertiary)" } },
            formatTimeAgo(chat.updatedAt),
          ),
        ),
        h(
          "span",
          { className: "dsh-tree-actions" },
          renderRowActionsMenu(
            Object.assign(
              { title: "Chat Actions (…)" },
              ellipsisTriggerProps(ctx, isMenuOpen, openMenu),
              {
                items: [
                  {
                    id: isPinned ? "unpin" : "pin",
                    label: isPinned ? "Unpin Chat" : "Pin Chat",
                    icon: h(glyphs.Pin, { size: 13 }),
                  },
                  { id: "rename", label: "Rename Chat", icon: h(glyphs.Edit, { size: 13 }) },
                  { id: "fork", label: "Fork Chat", icon: h(glyphs.Branch, { size: 13 }) },
                  {
                    id: "archive",
                    label: "Archive Chat",
                    icon: h(glyphs.Trash, { size: 13 }),
                    danger: true,
                  },
                ],
                onSelect: function (actionId) {
                  if (actionId === "pin" || actionId === "unpin") {
                    ctx.grouping.togglePinSession(chat.id);
                  } else if (actionId === "rename") {
                    promptAndRenameSession(
                      chat,
                      "Rename chat:",
                      ctx.backfilledTitles,
                      ctx.dispatch.rename,
                    );
                  } else if (actionId === "fork") {
                    ctx.dispatch.fork(chat.id);
                  } else if (actionId === "archive") {
                    ctx.onArchiveChat(chat.id);
                  }
                },
              },
            ),
          ),
        ),
      ),
      hasSubagents && isSubExp
        ? h(
            "div",
            { style: { display: "flex", flexDirection: "column", width: "100%" } },
            subagents.map(function (sub) {
              return renderSubagentRow(sub, padLeft, ctx);
            }),
          )
        : null,
    );
  }

  /**
   * Renders one subagent row nested under its parent chat.
   * @param sub - the subagent session record.
   * @param parentPadLeft - the parent chat row's indent.
   * @param ctx - see `renderChatRow`.
   * @returns the row element.
   */
  function renderSubagentRow(sub, parentPadLeft, ctx) {
    var isSubActive = sub.id === ctx.currentSessionId;
    var isSubMenuOpen = Boolean(ctx.ellipsisOpen && ctx.ellipsisOpen.id === "chat::" + sub.id);
    var label = __dshSessionRowTitle(sub, ctx.backfilledTitles, "Subagent");

    /** Opens the subagent's context menu at a click position or at the ellipsis button. */
    function openMenu(pos) {
      ctx.setEllipsisOpen({ id: "chat::" + sub.id, pos: pos });
    }
    var chatOpenHandlers = chatRowOpenHandlers(ctx, sub, openMenu, label);

    return h(
      "div",
      {
        key: "sub::" + sub.id,
        className:
          "dsh-tree-sessionRow dsh-tree-subagentRow" +
          (isSubActive ? " dsh-tree-sessionRowActive" : ""),
        role: "treeitem",
        "data-session-id": sub.id,
        style: {
          paddingLeft: parentPadLeft + 16 + "px",
          height: "28px",
          color: isSubActive ? "var(--dsw-alias-primary, #6366f1)" : "inherit",
          cursor: "pointer",
        },
        onClick: chatOpenHandlers.onClick,
        onContextMenu: chatOpenHandlers.onContextMenu,
      },
      h("span", { className: "dsh-tree-slot dsh-tree-icon" }, h(glyphs.Subagent, { size: 12 })),
      h(
        "span",
        {
          className: "dsh-tree-title",
          style: { fontSize: "11.5px" },
          title: label,
        },
        label,
      ),
      h(
        "span",
        {
          style: {
            fontSize: "10px",
            color: "var(--dsw-alias-label-tertiary)",
            marginLeft: "auto",
            marginRight: "4px",
            flexShrink: 0,
          },
        },
        formatTimeAgo(sub.updatedAt),
      ),
      h(
        "span",
        { className: "dsh-tree-actions" },
        renderRowActionsMenu(
          Object.assign(
            { title: "Subagent Actions", iconSize: 12 },
            ellipsisTriggerProps(ctx, isSubMenuOpen, openMenu),
            {
              items: [
                { id: "rename", label: "Rename Subagent", icon: h(glyphs.Edit, { size: 13 }) },
                {
                  id: "archive",
                  label: "Archive Subagent",
                  icon: h(glyphs.Trash, { size: 13 }),
                  danger: true,
                },
              ],
              onSelect: function (actionId) {
                if (actionId === "rename") {
                  promptAndRenameSession(
                    sub,
                    "Rename subagent:",
                    ctx.backfilledTitles,
                    ctx.dispatch.rename,
                  );
                } else if (actionId === "archive") {
                  ctx.onArchiveChat(sub.id);
                }
              },
            },
          ),
        ),
      ),
    );
  }

  /**
   * Renders one archived chat row, its quick-restore button and its
   * restore/rename/delete menu.
   * @param chat - the archived session record.
   * @param padLeft - the row's indent in pixels.
   * @param ctx - `{ currentSessionId, ellipsisOpen, setEllipsisOpen,
   * dispatch, grouping, quotasApiBase, loadAll, onOpenChat, onActionFailure,
   * backfilledTitles }`.
   * @returns the row element.
   */
  function renderArchivedChatRow(chat, padLeft, ctx) {
    var isChatActive = chat.id === ctx.currentSessionId;
    var isMenuOpen = Boolean(
      ctx.ellipsisOpen && ctx.ellipsisOpen.id === "archived-chat::" + chat.id,
    );
    var label = __dshSessionRowTitle(chat, ctx.backfilledTitles, "Archived Chat");

    /** Opens the archived row's context menu at a click position or at the ellipsis button. */
    function openMenu(pos) {
      ctx.setEllipsisOpen({ id: "archived-chat::" + chat.id, pos: pos });
    }
    var chatOpenHandlers = chatRowOpenHandlers(ctx, chat, openMenu, label);

    /** Restores the chat, surfacing a failure instead of leaving the click looking inert. */
    function restore() {
      ctx.grouping
        .unarchiveSession(chat.id, ctx.quotasApiBase)
        .catch(function (error) {
          ctx.onActionFailure({
            action: "Restore",
            message: (error && error.message) || "Restore failed.",
          });
        })
        .then(ctx.loadAll);
    }

    return h(
      "div",
      {
        key: "archived-chat::" + chat.id,
        className: "dsh-tree-sessionRow" + (isChatActive ? " dsh-tree-sessionRowActive" : ""),
        role: "treeitem",
        "data-session-id": chat.id,
        style: {
          paddingLeft: padLeft + "px",
          height: "28px",
          opacity: 0.75,
          cursor: "pointer",
          position: "relative",
        },
        onClick: chatOpenHandlers.onClick,
        onContextMenu: chatOpenHandlers.onContextMenu,
      },
      h(
        "span",
        {
          className: "dsh-tree-slot dsh-tree-icon",
          style: { color: "var(--dsw-alias-label-tertiary)" },
        },
        h(glyphs.Chat, { size: 14 }),
      ),
      h("span", { className: "dsh-tree-title", title: label }, label),
      h(
        "span",
        {
          style: {
            fontSize: "10px",
            color: "var(--dsw-alias-label-tertiary)",
            marginLeft: "auto",
            marginRight: "4px",
            flexShrink: 0,
          },
        },
        formatTimeAgo(chat.updatedAt),
      ),
      h(
        "span",
        { className: "dsh-tree-actions" },
        h(
          "button",
          {
            type: "button",
            className: "dsh-tree-actionBtn",
            title: "Restore / Unarchive",
            onClick: function (event) {
              event.stopPropagation();
              restore();
            },
          },
          h(glyphs.Restore, { size: 13 }),
        ),
        renderRowActionsMenu(
          Object.assign(
            { title: "Archived Actions (…)" },
            ellipsisTriggerProps(ctx, isMenuOpen, openMenu),
            {
              items: [
                {
                  id: "restore",
                  label: "Restore to Active",
                  icon: h(glyphs.Restore, { size: 13 }),
                },
                { id: "rename", label: "Rename Chat", icon: h(glyphs.Edit, { size: 13 }) },
                {
                  id: "delete",
                  label: "Delete Permanently",
                  icon: h(glyphs.Trash, { size: 13 }),
                  danger: true,
                },
              ],
              onSelect: function (actionId) {
                if (actionId === "restore") {
                  restore();
                } else if (actionId === "rename") {
                  promptAndRenameSession(
                    chat,
                    "Rename chat:",
                    ctx.backfilledTitles,
                    ctx.dispatch.rename,
                  );
                } else if (actionId === "delete") {
                  if (!confirm("Permanently delete this archived session?")) return;
                  ctx.grouping
                    .deletePermanentSession(chat.id, ctx.quotasApiBase)
                    .catch(function (error) {
                      ctx.onActionFailure({
                        action: "Delete",
                        message: (error && error.message) || "Delete failed.",
                      });
                    })
                    .then(ctx.loadAll);
                }
              },
            },
          ),
        ),
      ),
    );
  }

  return { renderChatRow: renderChatRow, renderArchivedChatRow: renderArchivedChatRow };
}
