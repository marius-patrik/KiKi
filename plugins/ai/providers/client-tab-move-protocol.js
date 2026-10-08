/**
 * Commit protocol for moving a tab between the shell's three tab surfaces:
 * the main area ("top"), the bottom panel ("bottom") and the secondary
 * sidebar ("right").
 *
 * Invariant: a transfer commits only once a destination has taken ownership,
 * and a committed tab id lives in exactly one surface. Sources therefore
 * never remove a tab in response to the request event itself — they drop
 * their copy when the commit event names a destination other than their own
 * surface. A request no destination accepts (see surfaceHostsTab) is refused
 * and leaves the tab exactly where it was instead of destroying it (#122).
 *
 * This file is prepended (via the package build script, the same way
 * crypto-polyfill.js and glyph-factory.js are) ahead of client.js, which then
 * does `var tabMove = __dshCreateTabMoveProtocol(window);` once the bundle's
 * script scope is live. Kept framework-free and classic-script compatible (no
 * import/export) so the shipped bytes can be regression-tested directly
 * against a plain EventTarget.
 */

/**
 * Creates the tab-move commit protocol bound to one event target (a browser
 * `window` in production, any EventTarget in tests).
 */
function __dshCreateTabMoveProtocol(target) {
  var MOVE_EVENTS = {
    top: "dsh:tab-moved-to-top",
    bottom: "dsh:tab-moved-to-bottom",
    right: "dsh:tab-moved-to-right",
  };
  var COMMITTED_EVENT = "dsh:tab-move-committed";

  /**
   * Whether `area` can host `tab`. The bottom panel and the secondary sidebar
   * render terminal and container tabs only; the conversation is the main
   * area's own DOM, so a chat tab cannot be re-hosted by another surface yet
   * and a move of it must be refused rather than silently dropping it (#122).
   */
  function surfaceHostsTab(area, tab) {
    if (!tab || !tab.id) return false;
    if (area === "top") return true;
    return tab.type === "terminal" || tab.type === "container";
  }

  /**
   * Destination-side: take ownership of `tab` for `area` and, only then,
   * commit the transfer. Returns false when the surface cannot host the tab;
   * nothing is dispatched, so every source keeps its copy.
   */
  function takeOwnership(area, tab) {
    if (!target || !surfaceHostsTab(area, tab)) return false;
    target.dispatchEvent(new CustomEvent(COMMITTED_EVENT, { detail: { id: tab.id, area: area } }));
    return true;
  }

  /**
   * Source-side: request a move to `area`. Removes nothing — removal happens
   * through onForeignCommit once a destination has committed the transfer.
   */
  function requestMove(area, tab) {
    if (!target || !tab || !MOVE_EVENTS[area]) return;
    target.dispatchEvent(new CustomEvent(MOVE_EVENTS[area], { detail: tab }));
  }

  /**
   * Destination-side: subscribe to move requests for one area. The handler
   * receives the requested tab; it takes ownership via takeOwnership.
   * Returns an unsubscribe function.
   */
  function onMoveRequested(area, handler) {
    if (!target || !MOVE_EVENTS[area]) return function () {};
    /** Forwards the request event's detail (the requested tab) to `handler`. */
    var listener = function (e) {
      handler(e.detail);
    };
    target.addEventListener(MOVE_EVENTS[area], listener);
    return function () {
      target.removeEventListener(MOVE_EVENTS[area], listener);
    };
  }

  /**
   * Source-side: subscribe to transfers committed by a surface other than
   * `ownArea`. The handler receives `{ id, area }` and drops its copy of
   * `id`. Commits naming the listener's own surface (it was the destination)
   * are skipped. Returns an unsubscribe function.
   */
  function onForeignCommit(ownArea, handler) {
    if (!target) return function () {};
    /** Forwards a commit's detail to `handler`, skipping the listener's own area. */
    var listener = function (e) {
      var detail = e.detail;
      if (!detail || !detail.id || detail.area === ownArea) return;
      handler(detail);
    };
    target.addEventListener(COMMITTED_EVENT, listener);
    return function () {
      target.removeEventListener(COMMITTED_EVENT, listener);
    };
  }

  return {
    MOVE_EVENTS: MOVE_EVENTS,
    COMMITTED_EVENT: COMMITTED_EVENT,
    surfaceHostsTab: surfaceHostsTab,
    takeOwnership: takeOwnership,
    requestMove: requestMove,
    onMoveRequested: onMoveRequested,
    onForeignCommit: onForeignCommit,
  };
}
