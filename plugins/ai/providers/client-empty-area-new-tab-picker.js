/**
 * Placeholder shown in a tab area holding no tabs, with buttons to open a new
 * conversation, terminal, or the container workspace there. It deliberately
 * does not name the area: the surrounding chrome already tells the user
 * where they are, and naming it produced copy like "Empty Main Area" --
 * internal layout vocabulary rather than a message. The copy prompts the
 * next action, and the buttons below carry it out.
 *
 * This file is prepended (via the package build script, alongside
 * client-tab-move-protocol.js and client-tab-move-menu.js) ahead of
 * client.js. Kept framework-free and classic-script compatible (no
 * import/export) for the same reason as those files.
 */

/**
 * Creates the EmptyAreaNewTabPicker component bound to one `h`
 * (React.createElement), one tab-move protocol instance (`tabMove`, from
 * `__dshCreateTabMoveProtocol`), and the glyph components its buttons use.
 */
function __dshCreateEmptyAreaNewTabPicker(deps) {
  var h = deps.h;
  var tabMove = deps.tabMove;
  var ChatGlyph = deps.ChatGlyph;
  var TerminalsGlyph = deps.TerminalsGlyph;
  var ContainersGlyph = deps.ContainersGlyph;

  var BUTTON_STYLE = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "8px",
    border: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
    background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.04))",
    color: "inherit",
    fontSize: "12.5px",
    fontWeight: 500,
    cursor: "pointer",
  };

  /** Renders the empty-area placeholder and its new-tab shortcut buttons. */
  function EmptyAreaNewTabPicker() {
    return h(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "32px",
          background: "var(--dsw-alias-bg-layer-0, #000000)",
          color: "var(--dsw-alias-label-primary, #fff)",
          fontFamily: "var(--ds-font-family, sans-serif)",
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" } },
        h("div", { style: { fontSize: "16px", fontWeight: 600 } }, "Nothing open here"),
        h(
          "div",
          { style: { fontSize: "12.5px", color: "var(--dsw-alias-label-secondary, #888)" } },
          "Open a new tab or drag an existing tab here",
        ),
      ),
      h(
        "div",
        { style: { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" } },
        h(
          "button",
          {
            type: "button",
            onClick: function () {
              tabMove.requestMove("top", {
                id: "chat-main",
                type: "chat",
                title: "Conversation",
              });
            },
            style: BUTTON_STYLE,
          },
          h(ChatGlyph, { size: 14 }),
          "+ New Conversation",
        ),
        h(
          "button",
          {
            type: "button",
            onClick: function () {
              var termId = "term-" + Date.now().toString(36);
              tabMove.requestMove("top", {
                id: termId,
                type: "terminal",
                title: termId,
                session: "0",
              });
            },
            style: BUTTON_STYLE,
          },
          h(TerminalsGlyph, { size: 14 }),
          "+ New Terminal",
        ),
        h(
          "button",
          {
            type: "button",
            onClick: function () {
              tabMove.requestMove("top", {
                id: "container-sandboxes",
                type: "container",
                title: "Containers",
              });
            },
            style: BUTTON_STYLE,
          },
          h(ContainersGlyph, { size: 14 }),
          "+ New Container",
        ),
      ),
    );
  }

  return EmptyAreaNewTabPicker;
}
