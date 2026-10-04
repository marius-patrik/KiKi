/**
 * The sidebar tree's shared collapsible-group shell: an icon, title, count
 * badge, hover actions and a chevron toggling a body. Pinned, Containers,
 * Terminals, Host, Global and Archived are all one instance of this shape;
 * before #138 each was its own copy-pasted block inside
 * `UnifiedWorkspacesBrowser`, which is exactly the duplication #96's
 * Containers/Terminals split would otherwise have doubled.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/tree-group
 */

/**
 * Build the group renderer bound to one runtime.
 * @param runtime - `{ React, h, glyphs }`. `glyphs.TriangleRight` is the
 * expand/collapse chevron every group shares.
 * @returns the render function.
 */
function __dshCreateTreeGroup(runtime) {
  var h = runtime.h;
  var TriangleRightFill14 = runtime.glyphs.TriangleRight;

  /**
   * Renders one collapsible sidebar group.
   * @param options - `{ icon, title, count, countTone, open, onToggle,
   * actions, children, emptyText, wrapperStyle }`. `icon` is a rendered
   * glyph element; `countTone` selects the badge color (`"primary"` or
   * `"muted"`); omit `count` to hide the badge entirely; `children` is the
   * group body, shown only when `open`, falling back to `emptyText` when it
   * has no rows to display (a caller passes an empty array/no children to
   * signal that).
   * @returns the group element.
   */
  return function renderTreeGroup(options) {
    var tone =
      options.countTone === "primary"
        ? { background: "rgba(99, 102, 241, 0.15)", color: "var(--dsw-alias-primary, #6366f1)" }
        : options.countTone === "success"
          ? { background: "rgba(63, 185, 80, 0.18)", color: "#3fb950" }
          : { background: "rgba(128,128,128,0.15)", color: "var(--dsw-alias-label-secondary)" };

    var hasRows = Boolean(
      options.children && (!Array.isArray(options.children) || options.children.length > 0),
    );

    return h(
      "div",
      {
        className: "dsh-tree-group",
        style: Object.assign(
          {
            display: "flex",
            flexDirection: "column",
            width: "100%",
            flex: "0 0 auto",
            margin: "2px 0 4px 0",
            paddingBottom: "4px",
            borderBottom: "1px solid var(--dsw-alias-border-l1)",
          },
          options.wrapperStyle || {},
        ),
      },
      h(
        "div",
        {
          className: "dsh-tree-projectRow",
          role: "treeitem",
          style: { position: "relative", paddingLeft: "8px", fontWeight: 600, height: "28px" },
          "aria-expanded": options.open,
          onClick: options.onToggle,
        },
        h("span", { className: "dsh-tree-slot dsh-tree-icon" }, options.icon),
        h(
          "span",
          { className: "dsh-tree-slot dsh-tree-chevron" },
          h(TriangleRightFill14, {
            className: "dsh-tree-arrow" + (options.open ? " dsh-tree-arrowOpen" : ""),
            size: 11,
          }),
        ),
        h("span", { className: "dsh-tree-title" }, options.title),
        options.count === undefined
          ? null
          : h(
              "span",
              {
                style: Object.assign(
                  {
                    padding: "1px 6px",
                    borderRadius: "8px",
                    fontSize: "9.5px",
                    fontWeight: 700,
                    marginLeft: "4px",
                  },
                  tone,
                ),
              },
              options.count,
            ),
        options.actions ? h("span", { className: "dsh-tree-actions" }, options.actions) : null,
      ),
      options.open
        ? h(
            "div",
            { style: { display: "flex", flexDirection: "column", width: "100%" } },
            hasRows
              ? options.children
              : h(
                  "div",
                  {
                    style: {
                      padding: "4px 8px 4px 24px",
                      fontSize: "11px",
                      color: "var(--dsw-alias-label-tertiary)",
                    },
                  },
                  options.emptyText || "(empty)",
                ),
          )
        : null,
    );
  };
}
