/**
 * The sidebar tree's "+" button: a dropdown offering to create a chat,
 * terminal session, container, or directory, or to open a folder as a
 * workspace, anchored at whichever group or folder row it was opened from.
 * Every group header and every folder row in the tree renders one of these,
 * scoped to that row's target directory.
 *
 * `__dshNewSessionMenuItems` is also called by `collapsed-rail.js`'s own
 * "+" menu, which offers the same chat/terminal/container choices in a
 * shorter list (no folder-scoped actions, since the collapsed rail has no
 * folder to scope them to).
 *
 * @module @dsh-stack/providers/client/sidebar-tree/new-item-menu
 */

/**
 * The chat/terminal/container item set every "new item" menu in the sidebar
 * tree starts with.
 * @param h - `React.createElement`.
 * @param glyphs - the runtime's glyph components.
 * @returns the three shared dropdown items.
 */
function __dshNewSessionMenuItems(h, glyphs) {
  return [
    { id: "chat", label: "Conversation", icon: h(glyphs.Chat, { size: 13 }) },
    { id: "terminal", label: "Terminal Session", icon: h(glyphs.Terminals, { size: 13 }) },
    { id: "container", label: "Sandbox Container", icon: h(glyphs.Containers, { size: 13 }) },
  ];
}

/**
 * Build the "+" button renderer bound to one runtime.
 * @param runtime - `{ React, h, glyphs, SelectDropdownMenu }`.
 * @returns the render function.
 */
function __dshCreateNewItemMenu(runtime) {
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var SelectDropdownMenu = runtime.SelectDropdownMenu;

  /**
   * Renders the "+" button and its dropdown for one anchor.
   * @param targetDir - the directory new items are created under.
   * @param anchorKey - unique id for this button, so only one menu opens at a time.
   * @param ctx - `{ plusMenu, setPlusMenu, onCreateChat, onCreateTerminal,
   * onCreateContainer, onCreateFolder, onOpenWorkspace, onArchiveEmptyChats }`.
   * @returns the button element.
   */
  return function renderNewItemMenu(targetDir, anchorKey, ctx) {
    var isMenuOpen = Boolean(
      ctx.plusMenu && (ctx.plusMenu === anchorKey || ctx.plusMenu.key === anchorKey),
    );

    return h(
      "div",
      { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
      h(
        "button",
        {
          type: "button",
          className: "dsh-tree-actionBtn",
          title: "New Item (+)",
          "aria-label": "New Item",
          onClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            var rect = event.currentTarget.getBoundingClientRect();
            var posX = Math.max(10, Math.min(window.innerWidth - 200, rect.right - 190));
            var posY = rect.bottom + 4;
            ctx.setPlusMenu(isMenuOpen ? null : { key: anchorKey, pos: { x: posX, y: posY } });
          },
        },
        h(glyphs.Plus, { size: 13 }),
      ),
      isMenuOpen
        ? h(SelectDropdownMenu, {
            open: true,
            position: ctx.plusMenu && ctx.plusMenu.pos ? ctx.plusMenu.pos : null,
            onClose: function () {
              ctx.setPlusMenu(null);
            },
            items: __dshNewSessionMenuItems(h, glyphs).concat([
              {
                id: "new-folder",
                label: "New Directory…",
                icon: h(glyphs.FolderPlus, { size: 13 }),
              },
              {
                id: "open-workspace",
                label: "Open Folder as Workspace…",
                icon: h(glyphs.BlueFolder, { size: 13 }),
              },
              {
                id: "archive-empty",
                label: "Archive Empty Chats",
                icon: h(glyphs.Trash, { size: 13 }),
                danger: true,
              },
            ]),
            onSelect: function (actionId) {
              ctx.setPlusMenu(null);
              if (actionId === "chat") ctx.onCreateChat(targetDir);
              else if (actionId === "terminal") ctx.onCreateTerminal(targetDir);
              else if (actionId === "container") ctx.onCreateContainer(targetDir);
              else if (actionId === "new-folder") ctx.onCreateFolder(targetDir);
              else if (actionId === "open-workspace") ctx.onOpenWorkspace(targetDir);
              else if (actionId === "archive-empty") ctx.onArchiveEmptyChats();
            },
          })
        : null,
    );
  };
}
