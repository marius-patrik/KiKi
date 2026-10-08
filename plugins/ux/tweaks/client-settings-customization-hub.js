/**
 * The Composition section's row model: which registered settings sections the
 * settings shell folds into one nav row, and how an active id resolves onto
 * that row plus one of its sub-tabs.
 *
 * The Customization group used to list Plugins, Modes, Tools, Agents, Loops
 * and a section literally named "Customization" as flat siblings, with
 * Profiles stranded outside the group entirely (#239, epic #235). Folding
 * happens in the shell, over the `settings.section` ledger, rather than by
 * re-registering the sections themselves, for one decisive reason: "Modes"
 * (`agent-presets`) is contributed by the harness's own
 * `dsh-client-ui-agent-preset`, whose plugin also owns the new-session preset
 * chip and the session-header preset label. The Stack cannot disable that
 * plugin to re-home the section without taking those two unrelated surfaces
 * down with it, and the harness checkout is pinned and pristine. A shell-side
 * fold needs neither: every folded section keeps its own registration,
 * component, props and persisted state, and is rendered through the same
 * `renderSlot("settings.section", ..., { only: id })` dispatch the nav row
 * used before — it is only reached from a sub-tab instead of a nav row.
 *
 * This file is prepended (via the package build script, alongside
 * client-settings-segmented-tabs.js) ahead of client.js. Kept framework-free
 * and classic-script compatible (no import/export) for the same reason as the
 * other prepended bundles: the shipped bytes are regression-tested directly.
 */

/**
 * Builds the fold model: the hub row's identity, the sections it absorbs in
 * the order they are presented, and the two pure folds the settings shell
 * applies to its nav rows and its active id.
 */
function __dshCreateSettingsCustomizationHub() {
  // Distinct from every sub-tab label below, and from the "Customization"
  // nav group it sits in: the section/sub-tab name collision reported on
  // #119 and #235 is what this row exists to end.
  var HUB_ID = "composition";
  var HUB_LABEL = "Composition";
  // Between Appearance (5) and the Integrations band, where the widest of the
  // folded sections (Tools, order 25) sat.
  var HUB_ORDER = 25;
  // Presentation order of the sub-tabs, independent of each section's own
  // registration order: what the Stack composes an assistant out of, from the
  // parts it loads (plugins) to the composition it runs under (profiles).
  var SUB_TAB_IDS = [
    "plugins",
    "agent-presets",
    "tools",
    "agents",
    "loops",
    "skills-hooks",
    "profiles",
  ];

  /**
   * Folds `rows` (the shell's nav rows, in ledger order) into the rows the nav
   * actually renders plus the hub's sub-tabs.
   *
   * `relabel` is the shell's own label pass, applied to every row here so a
   * sub-tab and a nav row can never disagree about a section's name. Sections
   * that are not registered simply produce no sub-tab, and when none of them
   * is present no hub row is inserted at all — the shell never offers a row
   * that would open onto nothing (.agents/rules/no-silent-no-ops.md).
   */
  function fold(rows, relabel) {
    var list = Array.isArray(rows) ? rows : [];
    var absorbed = {};
    var kept = [];
    var hubIndex = -1;
    for (var i = 0; i < list.length; i++) {
      var row = typeof relabel === "function" ? relabel(list[i]) : list[i];
      if (!row || !row.id) continue;
      if (SUB_TAB_IDS.indexOf(row.id) === -1) {
        kept.push(row);
        continue;
      }
      absorbed[row.id] = row;
      if (hubIndex === -1) hubIndex = kept.length;
    }
    var tabs = [];
    for (var t = 0; t < SUB_TAB_IDS.length; t++) {
      var section = absorbed[SUB_TAB_IDS[t]];
      if (section !== undefined) tabs.push({ id: section.id, label: section.label });
    }
    if (tabs.length > 0) {
      kept.splice(hubIndex, 0, { id: HUB_ID, label: HUB_LABEL, order: HUB_ORDER });
    }
    return { rows: kept, tabs: tabs };
  }

  /**
   * Resolves the shell's active section id onto the row the nav highlights and
   * the sub-tab the content area renders.
   *
   * A folded section's own id stays a valid address, so every existing way
   * into one — `openSection("plugins")`, a `dsh:open-settings` event naming a
   * section, a remembered selection — lands on the hub row with that sub-tab
   * open instead of falling back to the first nav row.
   */
  function resolve(activeId, tabs) {
    var list = Array.isArray(tabs) ? tabs : [];
    if (list.length === 0) return { active: activeId, subTab: undefined };
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === activeId) return { active: HUB_ID, subTab: activeId };
    }
    if (activeId === HUB_ID) return { active: HUB_ID, subTab: list[0].id };
    return { active: activeId, subTab: undefined };
  }

  return { id: HUB_ID, label: HUB_LABEL, order: HUB_ORDER, fold: fold, resolve: resolve };
}
