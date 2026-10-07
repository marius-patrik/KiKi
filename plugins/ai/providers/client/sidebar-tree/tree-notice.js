/**
 * The sidebar tree's inline failure notice: renders the message a guarded
 * row action reports through `session-action-dispatch.js` (#98) so a failed
 * rename, fork or archive is visible instead of silently doing nothing.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/tree-notice
 */

/**
 * Build the notice renderer bound to one runtime.
 * @param runtime - `{ React, h }`.
 * @returns the render function.
 */
function __dshCreateTreeNotice(runtime) {
  var h = runtime.h;

  /**
   * Renders the dismissible failure banner, or nothing when there is no
   * pending notice.
   * @param notice - `{ action, message }`, or null.
   * @param onDismiss - clears the notice.
   * @returns the banner element, or null.
   */
  return function renderTreeNotice(notice, onDismiss) {
    if (!notice) return null;
    return h(
      "div",
      {
        role: "alert",
        className: "dsh-tree-notice",
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          margin: "4px 8px",
          padding: "6px 8px",
          borderRadius: "6px",
          background: "rgba(248, 81, 73, 0.12)",
          border: "1px solid rgba(248, 81, 73, 0.35)",
          color: "var(--dsw-alias-label-primary, #e6edf3)",
          fontSize: "11.5px",
          lineHeight: "1.4",
        },
      },
      h("span", { style: { flex: 1 } }, h("strong", null, notice.action + ": "), notice.message),
      h(
        "button",
        {
          type: "button",
          "aria-label": "Dismiss",
          onClick: onDismiss,
          style: {
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            fontSize: "12px",
            lineHeight: 1,
            padding: 0,
          },
        },
        "✕",
      ),
    );
  };
}
