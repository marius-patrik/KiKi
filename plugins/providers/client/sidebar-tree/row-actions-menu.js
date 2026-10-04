/**
 * The row-level "…" actions trigger: an ellipsis button paired with the
 * `SelectDropdownMenu` it opens, positioned at the click or at the button.
 * Every row kind in the sidebar tree that carries a context menu -- a chat
 * row, a subagent row, an archived chat row -- opens its menu this same way;
 * factored out so that shape is written once (see `.jscpd.json`'s
 * zero-duplication threshold).
 *
 * @module @dsh-stack/providers/client/sidebar-tree/row-actions-menu
 */

/**
 * Build the row-actions-menu renderer bound to one runtime.
 * @param runtime - `{ React, h, glyphs, SelectDropdownMenu }`.
 * @returns the render function.
 */
function __dshCreateRowActionsMenu(runtime) {
  var h = runtime.h;
  var glyphs = runtime.glyphs;
  var SelectDropdownMenu = runtime.SelectDropdownMenu;

  /**
   * Renders one row's ellipsis trigger and its dropdown menu as a pair.
   * @param options - `{ title, iconSize, isOpen, onToggle, position, onClose,
   * items, onSelect }`. `onToggle` opens the menu at the button (no
   * position) or closes it when already open; `position` is the click
   * position when the menu was opened by right-click, else null.
   * @returns `[button, menu]` -- render this directly as JSX children.
   */
  return function renderRowActionsMenu(options) {
    return [
      h(
        "button",
        {
          key: "actions-trigger",
          type: "button",
          className: "dsh-tree-actionBtn",
          title: options.title,
          onClick: function (event) {
            event.stopPropagation();
            options.onToggle();
          },
        },
        h(glyphs.Ellipsis, { size: options.iconSize || 13 }),
      ),
      h(SelectDropdownMenu, {
        key: "actions-menu",
        open: options.isOpen,
        position: options.position,
        onClose: options.onClose,
        items: options.items,
        onSelect: options.onSelect,
      }),
    ];
  };
}
