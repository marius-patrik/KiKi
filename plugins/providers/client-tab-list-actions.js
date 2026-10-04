/**
 * Shared mutating actions over one area's tab list: the small "tab model"
 * every area's tab bar otherwise reimplements slightly differently — add a
 * tab if it isn't already present and select it, or drop a tab by id. Used
 * by the main area's tab bar and the secondary sidebar's tab bar, both of
 * which hold a plain `[tabs, setTabs]` / `[activeTab, setActiveTab]` React
 * state pair. The bottom panel manages a richer session/window list of its
 * own (tracked for full one-concern-per-file decomposition in issue #40)
 * and does not use this file.
 *
 * This file is prepended (via the package build script, alongside
 * client-tab-move-protocol.js and client-tab-move-menu.js) ahead of
 * client.js. Kept framework-free and classic-script compatible (no
 * import/export) for the same reason as those files.
 */

/**
 * Creates the tab-list actions bound to one area's `setTabs` / `setActiveTab`
 * React state setters.
 */
function __dshCreateTabListActions(deps) {
  var setTabs = deps.setTabs;
  var setActiveTab = deps.setActiveTab;

  /**
   * Adds `tab` to the list if not already present (by id), then selects it.
   * Idempotent re-selection when the tab already exists.
   */
  function addTabIfAbsentAndActivate(tab) {
    setTabs(function (prev) {
      if (
        prev.some(function (t) {
          return t.id === tab.id;
        })
      )
        return prev;
      return prev.concat([tab]);
    });
    setActiveTab(tab.id);
  }

  /** Removes the tab whose id is `tabId` from the list. Does not touch selection. */
  function removeTabById(tabId) {
    setTabs(function (prev) {
      return prev.filter(function (t) {
        return t.id !== tabId;
      });
    });
  }

  return {
    addTabIfAbsentAndActivate: addTabIfAbsentAndActivate,
    removeTabById: removeTabById,
  };
}
