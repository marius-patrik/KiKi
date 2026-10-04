/**
 * Shared "move tab to another surface" / "close tab" menu items, and the
 * single, protocol-safe action that carries out a move, used by every area's
 * tab-bar menu (the main area's per-row context menu and overflow menu, and
 * the secondary sidebar's dock menu).
 *
 * Before this file existed, the main area's own overflow menu and its
 * per-row context menu each built a near-identical "Move Tab to Bottom
 * Panel" / "Move Tab to Secondary Sidebar" item list, and both of those call
 * sites — plus the secondary sidebar's dock menu — removed the tab from
 * their own list immediately and only *then* dispatched the move-request
 * event, instead of going through client-tab-move-protocol.js's
 * request/commit handshake. That resurrected the exact failure mode #122
 * fixed: requesting a move for a tab the destination cannot host (nothing
 * gates which destinations a menu offers by tab type) removed the tab from
 * its source before any destination had taken ownership, so a refused move
 * lost the tab instead of leaving it in place. Centralizing the item list
 * and the move action here means the fix — route every move through
 * `tabMove.requestMove` and never remove locally — has one call site instead
 * of three, and `buildMoveMenuItems` only offers destinations
 * `tabMove.surfaceHostsTab` actually accepts, so the menu itself cannot
 * present an action that can only silently fail (see
 * .agents/rules/no-silent-no-ops.md).
 *
 * This file is prepended (via the package build script, alongside
 * client-tab-move-protocol.js) ahead of client.js. Kept framework-free and
 * classic-script compatible (no import/export) for the same reason as
 * client-tab-move-protocol.js: the shipped bytes are regression-tested
 * directly.
 */

/**
 * Creates the shared move-menu helpers bound to one tab-move protocol
 * instance (`tabMove`, from `__dshCreateTabMoveProtocol`) and one
 * `h` (React.createElement).
 */
function __dshCreateTabMoveMenu(deps) {
  var h = deps.h;
  var tabMove = deps.tabMove;
  var glyphs = deps.glyphs || {};

  var AREA_LABELS = { top: "Main Area", bottom: "Bottom Panel", right: "Secondary Sidebar" };

  /**
   * Requests a move of `tab` to `area` via the shared commit protocol.
   * Never removes `tab` from the caller's own list — the caller's own
   * `tabMove.onForeignCommit` listener does that, and only once the
   * destination has actually taken ownership (#122).
   */
  function moveTabTo(area, tab) {
    tabMove.requestMove(area, tab);
  }

  /**
   * Builds the "Move Tab to <area>" / "Close Tab" item list for a dropdown or
   * context menu.
   *
   * - `tab`: the tab the menu applies to; returns [] when absent.
   * - `destinations`: areas this menu may offer (e.g. ["bottom", "right"]
   *   for the main area) — filtered down to the ones `tab` can actually be
   *   hosted by (surfaceHostsTab), so a type the destination would refuse
   *   never appears as a choice.
   * - `closable`: whether to include a "Close Tab" entry at all (the main
   *   conversation tab cannot be closed).
   * - `closeLabel`: override for the close entry's label.
   */
  function buildMoveMenuItems(opts) {
    var tab = opts.tab;
    if (!tab) return [];
    var destinations = (opts.destinations || []).filter(function (area) {
      return tabMove.surfaceHostsTab(area, tab);
    });
    var closable = opts.closable !== false && tab.type !== "chat";
    var items = destinations.map(function (area) {
      var Glyph = glyphs[area];
      return {
        id: "move-" + area,
        label: (opts.moveLabelPrefix || "Move Tab to ") + AREA_LABELS[area],
        icon: Glyph ? h(Glyph, { size: 13 }) : null,
      };
    });
    if (closable) {
      var CloseGlyph = glyphs.close;
      items.push({
        id: "close-tab",
        label: opts.closeLabel || "Close Tab",
        icon: CloseGlyph ? h(CloseGlyph, { size: 13 }) : null,
        danger: true,
      });
    }
    return items;
  }

  /**
   * Dispatches the action selected from a `buildMoveMenuItems` list: routes
   * `move-<area>` ids through the safe protocol (`moveTabTo`) and calls
   * `onClose(tab)` for `close-tab`. Returns true if it handled `actionId`,
   * so callers can fall through to their own menu items otherwise.
   */
  function handleMoveMenuSelect(actionId, tab, onClose) {
    if (!tab) return false;
    var match = /^move-(top|bottom|right)$/.exec(actionId);
    if (match) {
      moveTabTo(match[1], tab);
      return true;
    }
    if (actionId === "close-tab") {
      if (onClose) onClose(tab);
      return true;
    }
    return false;
  }

  return {
    moveTabTo: moveTabTo,
    buildMoveMenuItems: buildMoveMenuItems,
    handleMoveMenuSelect: handleMoveMenuSelect,
  };
}
