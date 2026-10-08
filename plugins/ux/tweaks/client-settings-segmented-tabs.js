/**
 * The settings shell's segmented tab strip: the pill row that switches
 * between the parts of one settings surface.
 *
 * Two surfaces present that same concept and must therefore render the same
 * control (.agents/rules/unified-surface-components.md): the consolidated
 * Composition section's sub-tab bar, which switches between whole registered
 * sections, and the Skills & Hooks section's own skills/hooks/scripts strip,
 * which switches between parts of one section. Only the tab list differs, so
 * the strip is written once here and parameterised by it.
 *
 * This file is prepended (via the package build script, alongside
 * client-settings-customization-hub.js) ahead of client.js. Kept
 * framework-free and classic-script compatible (no import/export) for the
 * same reason as the other prepended bundles: the shipped bytes are
 * regression-tested directly.
 */

/**
 * Binds the strip to one `h` (React.createElement) and returns the component.
 *
 * Props: `tabs` (an array of `{ id, label }`), `active` (the selected id), and
 * `onSelect` (called with a tab id). An empty `tabs` renders nothing rather
 * than an empty frame.
 */
function __dshCreateSettingsSegmentedTabs(h) {
  /** One pill: the selected tab carries the accent fill, the rest are quiet. */
  function renderTab(tab, isActive, onSelect) {
    return h(
      "button",
      {
        key: tab.id,
        type: "button",
        role: "tab",
        "aria-selected": isActive ? "true" : "false",
        onClick: function () {
          onSelect(tab.id);
        },
        style: {
          padding: "4px 12px",
          borderRadius: "6px",
          border: "none",
          background: isActive ? "var(--dsw-alias-primary, #6366f1)" : "transparent",
          color: isActive ? "#fff" : "var(--dsw-alias-label-secondary)",
          fontSize: "12px",
          fontWeight: isActive ? 600 : 400,
          whiteSpace: "nowrap",
          cursor: "pointer",
          transition: "all 120ms ease",
        },
      },
      tab.label,
    );
  }

  return function SettingsSegmentedTabs(props) {
    var tabs = props && Array.isArray(props.tabs) ? props.tabs : [];
    if (tabs.length === 0) return null;
    var onSelect = props.onSelect;
    return h(
      "div",
      {
        role: "tablist",
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.05))",
          padding: "3px",
          borderRadius: "8px",
          border: "1px solid var(--dsw-alias-border-l1)",
        },
      },
      tabs.map(function (tab) {
        return renderTab(tab, tab.id === props.active, onSelect);
      }),
    );
  };
}
