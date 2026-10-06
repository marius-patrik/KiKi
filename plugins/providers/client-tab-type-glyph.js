/**
 * Resolves the icon glyph component for a tab's type. Shared by every
 * area's tab strip: the type -> icon mapping is one flat table, not a
 * decision each area's tab bar should re-derive with its own ternary chain
 * (the main area hosts all five tab types; the secondary sidebar and bottom
 * panel only ever hold terminal/container tabs, but resolve through the
 * same table rather than a narrower copy of it).
 *
 * This file is prepended (via the package build script, alongside
 * client-tab-move-protocol.js and client-tab-move-menu.js) ahead of
 * client.js. Kept framework-free and classic-script compatible (no
 * import/export) for the same reason as those files.
 */

/**
 * Creates the tab-type glyph resolver bound to one `h` (React.createElement)
 * and the glyph components for each tab type.
 */
function __dshCreateTabTypeGlyph(deps) {
  var h = deps.h;
  var glyphsByType = {
    terminal: deps.TerminalsGlyph,
    container: deps.ContainersGlyph,
    file: deps.FileGlyph,
    repo: deps.RepoGlyph,
    chat: deps.ChatGlyph,
  };

  /** Renders the icon for `tab.type` at `size`, falling back to the chat glyph. */
  function tabTypeGlyph(tab, size) {
    var Glyph = (tab && glyphsByType[tab.type]) || glyphsByType.chat;
    return h(Glyph, { size: size });
  }

  return tabTypeGlyph;
}
