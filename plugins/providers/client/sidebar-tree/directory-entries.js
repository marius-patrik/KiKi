/**
 * Renders the Host Machine group's filesystem tree: directories (decorated
 * as an app bundle, a vendor/internal folder, a repo, a workspace or a plain
 * folder), the chats grouped under each directory, and files. Recurses into
 * expanded subdirectories.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/directory-entries
 */

/**
 * Build the directory-entries renderer bound to one runtime.
 * @param runtime - `{ React, h, glyphs, renderAppIcon }`.
 * @param renderChatRow - the chat-row renderer from `tree-row.js`, for the
 * chats grouped under each directory.
 * @param renderNewItemMenu - the "+" button renderer from `new-item-menu.js`,
 * for each folder row's own new-item action.
 * @returns the render function.
 */
function __dshCreateDirectoryEntries(runtime, renderChatRow, renderNewItemMenu) {
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var renderAppIcon = runtime.renderAppIcon;

  var VENDOR_OR_INTERNAL_NAMES = [
    "Applications",
    "Library",
    "System",
    "Users",
    "node_modules",
    ".git",
    "dist",
    "lib",
    ".turbo",
  ];

  /**
   * Whether a directory entry's name marks it as a vendor/internal/system
   * folder that never gets repo or workspace decoration.
   * @param name - the entry's file name.
   * @returns whether the name is vendor/internal.
   */
  function isVendorOrInternalName(name) {
    if (!name) return false;
    var lower = name.toLowerCase();
    return VENDOR_OR_INTERNAL_NAMES.indexOf(name) !== -1 || lower === "system" || lower === "users";
  }

  /**
   * Renders one directory level's entries: subdirectories (recursively, when
   * expanded) and files. Filtered by the tree's search query when one is
   * active.
   * @param dirPath - the directory to render.
   * @param depth - the directory's nesting depth, driving indent.
   * @param ctx - `{ dirCache, loadingPaths, searchQuery, expandedPaths,
   * toggleExpand, folderSessions, workspaces, ellipsisOpen, setEllipsisOpen,
   * plusMenu, newItemMenuCtx, chatRowCtx }`. `newItemMenuCtx` and
   * `chatRowCtx` are passed through unchanged to `renderNewItemMenu` and
   * `renderChatRow`.
   * @returns the entries, or a loading/empty placeholder.
   */
  function renderDirEntries(dirPath, depth, ctx) {
    var entries = ctx.dirCache[dirPath];
    var itemLeftPad = 8 + depth * 16;

    if (ctx.loadingPaths[dirPath]) {
      return h(
        "div",
        {
          key: "loading-" + dirPath,
          style: {
            padding: "4px 8px 4px " + (itemLeftPad + 16) + "px",
            fontSize: "11px",
            color: "var(--dsw-alias-label-tertiary)",
          },
        },
        "Loading…",
      );
    }
    if (!entries || entries.length === 0) {
      return h(
        "div",
        {
          key: "empty-" + dirPath,
          style: {
            padding: "4px 8px 4px " + (itemLeftPad + 16) + "px",
            fontSize: "11px",
            color: "var(--dsw-alias-label-tertiary)",
          },
        },
        "(empty)",
      );
    }

    var query =
      ctx.searchQuery && ctx.searchQuery.trim() ? ctx.searchQuery.trim().toLowerCase() : "";
    var visibleEntries = query
      ? entries.filter(function (entry) {
          return (entry.name || "").toLowerCase().indexOf(query) !== -1;
        })
      : entries;

    if (visibleEntries.length === 0 && query) return null;

    return visibleEntries.map(function (entry) {
      var isDir = Boolean(entry.isDirectory);
      var isExpanded = Boolean(ctx.expandedPaths[entry.path]);

      if (!isDir) {
        var isAppFile =
          entry.name.endsWith(".app") ||
          entry.name.endsWith(".exe") ||
          entry.name.endsWith(".dmg") ||
          entry.name.endsWith(".pkg");
        return h(
          "div",
          {
            key: entry.path,
            className: "dsh-tree-sessionRow",
            role: "treeitem",
            style: { paddingLeft: itemLeftPad + "px", height: "28px" },
            onClick: function () {
              window.dispatchEvent(
                new CustomEvent("dsh:open-file-tab", {
                  detail: {
                    id: "file::" + entry.path,
                    type: "file",
                    title: entry.name,
                    path: entry.path,
                  },
                }),
              );
            },
          },
          h(
            "span",
            {
              className: "dsh-tree-slot",
              style: {
                width: "16px",
                color: isAppFile ? "var(--dsw-alias-primary)" : "var(--dsw-alias-label-tertiary)",
              },
            },
            isAppFile ? renderAppIcon(entry.name, 15, entry.path) : h(glyphs.File, { size: 13 }),
          ),
          h(
            "span",
            {
              className: "dsh-tree-sessionTitle",
              style: { fontSize: "12px", marginLeft: "4px" },
              title: entry.path,
            },
            entry.name,
          ),
        );
      }

      var chatsInDir = ctx.folderSessions[entry.path] || [];
      var isAppBundle = Boolean(
        entry.name &&
          (entry.name.endsWith(".app") ||
            entry.name.endsWith(".dmg") ||
            entry.name.endsWith(".pkg")),
      );
      var isApplications = entry.name === "Applications";
      var isLibrary = entry.name === "Library";
      var isSystem = entry.name === "System" || entry.name.toLowerCase() === "system";
      var isUsers = entry.name === "Users" || entry.name.toLowerCase() === "users";
      var isVendorOrInternal = isVendorOrInternalName(entry.name);
      var isWorkspace =
        !isVendorOrInternal &&
        Boolean(
          ctx.workspaces &&
            ctx.workspaces.some(function (workspace) {
              var workspacePath = workspace.path || workspace.cwd;
              if (!workspacePath) return false;
              if (workspacePath.length > 1 && workspacePath.endsWith("/"))
                workspacePath = workspacePath.slice(0, -1);
              var entryPath = entry.path;
              if (entryPath && entryPath.length > 1 && entryPath.endsWith("/"))
                entryPath = entryPath.slice(0, -1);
              return workspacePath === entryPath && entryPath !== "/Users/user";
            }),
        );
      var isRepo =
        !isVendorOrInternal && Boolean(entry.isRepo || entry.name === "dsh-stack" || isWorkspace);

      var icon = isAppBundle
        ? renderAppIcon(entry.name, 16, entry.path)
        : isApplications
          ? h(glyphs.App, { size: 15 })
          : isLibrary
            ? h(glyphs.Library, { size: 15 })
            : isSystem
              ? h(glyphs.System, { size: 15 })
              : isUsers
                ? h(glyphs.Users, { size: 15 })
                : isRepo
                  ? h(glyphs.Repo, { size: 15 })
                  : isWorkspace
                    ? h(glyphs.Workspace, { size: 15 })
                    : h(glyphs.FolderOpen, { size: 15 });

      return h(
        "div",
        { key: entry.path, style: { display: "flex", flexDirection: "column", width: "100%" } },
        h(
          "div",
          {
            className: "dsh-tree-projectRow",
            role: "treeitem",
            style: { position: "relative", paddingLeft: itemLeftPad + "px", height: "28px" },
            "aria-expanded": isExpanded,
            onClick: function () {
              ctx.toggleExpand(entry.path);
            },
            onDoubleClick: isRepo
              ? function (event) {
                  event.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("dsh:open-repo-tab", {
                      detail: {
                        id: "repo::" + entry.path,
                        type: "repo",
                        title: entry.name,
                        path: entry.path,
                      },
                    }),
                  );
                }
              : undefined,
            onContextMenu: function (event) {
              event.preventDefault();
              event.stopPropagation();
              ctx.setEllipsisOpen({
                id: "folder::" + entry.path,
                pos: { x: event.clientX, y: event.clientY },
              });
            },
          },
          h("span", { className: "dsh-tree-slot dsh-tree-icon" }, icon),
          h(
            "span",
            { className: "dsh-tree-slot dsh-tree-chevron" },
            h(glyphs.TriangleRight, {
              className: "dsh-tree-arrow" + (isExpanded ? " dsh-tree-arrowOpen" : ""),
              size: 11,
            }),
          ),
          h("span", { className: "dsh-tree-title", title: entry.path }, entry.name),
          chatsInDir.length > 0
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
                  },
                },
                chatsInDir.length,
              )
            : null,
          h(
            "span",
            { className: "dsh-tree-actions" },
            renderNewItemMenu(entry.path, "folder-plus::" + entry.path, ctx.newItemMenuCtx),
          ),
        ),
        isExpanded
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", width: "100%" } },
              chatsInDir.map(function (chat) {
                return renderChatRow(chat, 8 + (depth + 1) * 16, ctx.chatRowCtx);
              }),
              renderDirEntries(entry.path, depth + 1, ctx),
            )
          : null,
      );
    });
  }

  return renderDirEntries;
}
