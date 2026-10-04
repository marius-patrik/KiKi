// jscpd:ignore-start -- hand-authored UI bundle; tracked for full one-concern-per-file decomposition in issue #40
(function () {
  if (typeof globalThis.crypto === "undefined") globalThis.crypto = {};
  if (typeof globalThis.crypto.randomUUID !== "function") {
    globalThis.crypto.randomUUID = function () {
      if (typeof globalThis.crypto.getRandomValues === "function") {
        try {
          return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
            return (
              c ^
              (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
            ).toString(16);
          });
        } catch (e) {}
      }
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
          v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
})();

window.__ModuleLoader__.load({
  id: "@dsh-stack/providers",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");
    var h = React.createElement;
    var Fragment = React.Fragment;
    var createGlyphComponent = __dshCreateGlyphComponent(h);
    var createDecoratedGlyphComponent = __dshCreateDecoratedGlyphComponent(h);
    var quotaWidgets = __dshCreateQuotaWidgets(h);
    var P = require("@deepseek-ai/dsh-client-ui-primitives");

    // Commit protocol for moving tabs between the shell surfaces (main area,
    // bottom panel, secondary sidebar). Destinations commit only once they
    // have taken ownership; sources remove their copy on the commit event.
    // See client-tab-move-protocol.js (prepended to this bundle at build time).
    var tabMove = __dshCreateTabMoveProtocol(typeof window !== "undefined" ? window : undefined);

    var NS = "providers";
    var VAULT_API = "/vault/api";
    var QUOTAS_API = "/quotas/api";

    // Shared full-screen centering overlay used by the simple credential/model/
    // OAuth modals (EditValueModal, AddKeyModal, AddModelModal, OAuthFlowModal).
    var MODAL_OVERLAY_STYLE = {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
    };

    // Shared text-input style for the simple credential/model modals above.
    var MODAL_INPUT_STYLE = {
      padding: "8px 12px",
      borderRadius: "6px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-surface-l1)",
      color: "inherit",
    };

    // Shared Cancel/primary-action button styles for the same modals.
    var MODAL_CANCEL_BUTTON_STYLE = {
      padding: "7px 14px",
      borderRadius: "6px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
    };
    var MODAL_PRIMARY_BUTTON_STYLE = {
      padding: "7px 14px",
      borderRadius: "6px",
      border: "none",
      background: "var(--dsw-alias-primary, #6366f1)",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    };

    var TREE_STYLES = `
@keyframes dsh-row-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}
.dsh-tree-projectRow {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  border-radius: 6px;
  padding: 0 6px;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
  width: 100%;
  font-size: 12px;
  transition: background 120ms ease;
}
.dsh-tree-projectRow:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-tree-slot {
  flex: none;
  width: 16px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-tree-projectRow .dsh-tree-chevron,
.dsh-tree-sessionRow.dsh-has-children .dsh-tree-chevron {
  display: none;
}
.dsh-tree-projectRow:hover .dsh-tree-chevron,
.dsh-tree-sessionRow.dsh-has-children:hover .dsh-tree-chevron {
  display: inline-flex;
}
.dsh-tree-projectRow:hover .dsh-tree-icon,
.dsh-tree-sessionRow.dsh-has-children:hover .dsh-tree-icon {
  display: none;
}
.dsh-tree-sessionRow:not(.dsh-has-children) .dsh-tree-chevron {
  display: none !important;
}
.dsh-tree-sessionRow:not(.dsh-has-children) .dsh-tree-icon {
  display: inline-flex !important;
}
.dsh-tree-arrow {
  transition: transform 150ms var(--ds-ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsh-tree-arrowOpen {
  transform: rotate(90deg);
}
.dsh-tree-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  line-height: 18px;
  font-weight: 500;
}
.dsh-tree-actions {
  display: none;
  align-items: center;
  gap: 3px;
  height: 20px;
  margin-left: auto;
}
.dsh-tree-projectRow:hover .dsh-tree-actions,
.dsh-tree-sessionRow:hover .dsh-tree-actions {
  display: inline-flex !important;
}
.dsh-tree-actionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  padding: 0;
}
.dsh-tree-actionBtn:hover {
  background: var(--dsw-alias-button-elevated-fill, rgba(128,128,128,0.25));
  color: var(--dsw-alias-label-primary);
}
.dsh-tree-sessionRow {
  display: flex;
  align-items: center;
  height: 30px;
  gap: 4px;
  border-radius: 6px;
  padding: 0 6px 0 16px;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
  width: 100%;
  font-size: 12px;
  animation: dsh-row-in 150ms var(--ds-ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  transition: background 100ms;
}
.dsh-tree-sessionRow:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08)) !important;
}
.dsh-tree-sessionRowActive,
.dsh-tree-sessionRowActive:hover {
  background: var(--dsw-alias-surface-l2, rgba(255, 255, 255, 0.12)) !important;
}
/* Model Picker trigger icon (Single Lucide Cube in pure crisp white) */
[data-slot="conversation.input.model"] > button::before,
button[class*="ModelSelect_trigger"]::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  flex-shrink: 0;
  vertical-align: middle;
  background-color: var(--dsw-alias-label-primary, #ffffff) !important;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'/%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'/%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'/%3E%3C/svg%3E") no-repeat center / contain;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'/%3E%3Cpolyline points='3.27 6.96 12 12.01 20.73 6.96'/%3E%3Cline x1='12' y1='22.08' x2='12' y2='12'/%3E%3C/svg%3E") no-repeat center / contain;
}

/* Prevent duplicate icons inside the trigger button */
[data-slot="conversation.input.model"] > button > svg:first-child,
button[class*="ModelSelect_trigger"] > svg:not(:last-child) {
  display: none !important;
}

/* Remove duplicate right-side cube or menu option cube ::before */
[class*="ModelSelect_menu"] button::before,
[class*="ModelSelect_menu"] [class*="cell"]::before,
[class*="ModelSelect_menu"] [class*="option"]::before,
[class*="ModelSelect_cellValue"]::before,
[class*="cellValue"]::before {
  content: none !important;
  display: none !important;
}

/* Universal Animated Lucide Icons */
svg:not([class*="badge"]),
.dsh-icon-animated {
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), stroke 180ms ease, fill 180ms ease, opacity 180ms ease !important;
  transform-origin: center center;
}

/* Authentic Lucide-Animate Keyframe Animations */
@keyframes lucide-search-anim {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(-15deg) scale(1.1); }
  100% { transform: rotate(0deg) scale(1); }
}

@keyframes lucide-terminal-slide {
  0% { transform: translateX(0); }
  50% { transform: translateX(2.5px); }
  100% { transform: translateX(0); }
}

@keyframes lucide-plus-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(90deg); }
}

@keyframes lucide-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes lucide-trash-lid {
  0% { transform: rotate(0deg); }
  30% { transform: rotate(-18deg) translateY(-2px); }
  70% { transform: rotate(-18deg) translateY(-2px); }
  100% { transform: rotate(0deg); }
}

@keyframes lucide-pencil-write {
  0% { transform: rotate(0deg) translate(0, 0); }
  25% { transform: rotate(-12deg) translate(-1px, -1px); }
  75% { transform: rotate(8deg) translate(1px, 0); }
  100% { transform: rotate(0deg) translate(0, 0); }
}

@keyframes lucide-pin-drop {
  0% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-3px) rotate(-20deg); }
  100% { transform: translateY(0) rotate(-15deg); }
}

@keyframes lucide-gear-turn {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(90deg); }
}

@keyframes lucide-chat-bounce {
  0% { transform: scale(1); }
  40% { transform: scale(1.15, 0.85); }
  70% { transform: scale(0.9, 1.1); }
  100% { transform: scale(1); }
}

@keyframes lucide-folder-open {
  0% { transform: scale(1); }
  50% { transform: translateY(-2px) scale(1.06); }
  100% { transform: scale(1); }
}

@keyframes lucide-sparkle-pulse {
  0% { transform: scale(1) rotate(0deg); opacity: 1; }
  50% { transform: scale(1.2) rotate(15deg); opacity: 0.85; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

@keyframes lucide-dock-slide {
  0% { transform: translateX(0); }
  50% { transform: translateX(3px); }
  100% { transform: translateX(0); }
}

@keyframes lucide-panel-bottom {
  0% { transform: translateY(0); }
  50% { transform: translateY(2.5px); }
  100% { transform: translateY(0); }
}

@keyframes lucide-copy-slide {
  0% { transform: translate(0, 0); }
  50% { transform: translate(-2px, -2px); }
  100% { transform: translate(0, 0); }
}

@keyframes lucide-eye-wink {
  0% { transform: scaleY(1); }
  50% { transform: scaleY(0.15); }
  100% { transform: scaleY(1); }
}

@keyframes lucide-mic-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.18); }
  100% { transform: scale(1); }
}

@keyframes lucide-restore-bounce {
  0% { transform: translateY(0); }
  50% { transform: translateY(2.5px); }
  100% { transform: translateY(0); }
}

@keyframes lucide-cube-bounce {
  0% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-2px) scale(1.05); }
  100% { transform: translateY(0) scale(1); }
}

/* Hover bindings for all lucide-animated classes */
button:hover .dsh-icon-search, .dsh-icon-search:hover, [role="button"]:hover .dsh-icon-search {
  animation: lucide-search-anim 0.45s ease-in-out !important;
}

button:hover .dsh-icon-terminal, .dsh-icon-terminal:hover, [role="button"]:hover .dsh-icon-terminal, .dsh-tree-sessionRow:hover .dsh-icon-terminal {
  animation: lucide-terminal-slide 0.35s cubic-bezier(0.25, 1, 0.5, 1) !important;
}

button:hover .dsh-icon-plus, .dsh-icon-plus:hover, [role="button"]:hover .dsh-icon-plus {
  animation: lucide-plus-spin 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
}

button:hover .dsh-icon-refresh, .dsh-icon-refresh:hover, [role="button"]:hover .dsh-icon-refresh {
  animation: lucide-spin-cw 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

button:hover .dsh-icon-trash, .dsh-icon-trash:hover, [role="button"]:hover .dsh-icon-trash {
  animation: lucide-trash-lid 0.45s ease-in-out !important;
}

button:hover .dsh-icon-edit, .dsh-icon-edit:hover, [role="button"]:hover .dsh-icon-edit {
  animation: lucide-pencil-write 0.45s ease-in-out !important;
}

button:hover .dsh-icon-pin, .dsh-icon-pin:hover, [role="button"]:hover .dsh-icon-pin, .dsh-tree-sessionRow:hover .dsh-icon-pin {
  animation: lucide-pin-drop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
}

button:hover .dsh-icon-sliders, button:hover .dsh-icon-settings, .dsh-icon-sliders:hover, .dsh-icon-settings:hover, [role="button"]:hover .dsh-icon-sliders, [role="button"]:hover .dsh-icon-settings {
  animation: lucide-gear-turn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

button:hover .dsh-icon-chat, .dsh-icon-chat:hover, [role="button"]:hover .dsh-icon-chat, .dsh-tree-sessionRow:hover .dsh-icon-chat {
  animation: lucide-chat-bounce 0.4s ease-in-out !important;
}

button:hover .dsh-icon-folder, .dsh-icon-folder:hover, [role="button"]:hover .dsh-icon-folder, .dsh-tree-projectRow:hover .dsh-icon-folder {
  animation: lucide-folder-open 0.35s ease-in-out !important;
}

button:hover .dsh-icon-sparkles, .dsh-icon-sparkles:hover, [role="button"]:hover .dsh-icon-sparkles {
  animation: lucide-sparkle-pulse 0.55s ease-in-out infinite !important;
}

button:hover .dsh-icon-dock, .dsh-icon-dock:hover, [role="button"]:hover .dsh-icon-dock {
  animation: lucide-dock-slide 0.35s ease-in-out !important;
}

button:hover .dsh-icon-panel-bottom, .dsh-icon-panel-bottom:hover, [role="button"]:hover .dsh-icon-panel-bottom {
  animation: lucide-panel-bottom 0.35s ease-in-out !important;
}

button:hover .dsh-icon-copy, .dsh-icon-copy:hover, [role="button"]:hover .dsh-icon-copy {
  animation: lucide-copy-slide 0.35s ease-in-out !important;
}

button:hover .dsh-icon-eye, .dsh-icon-eye:hover, [role="button"]:hover .dsh-icon-eye {
  animation: lucide-eye-wink 0.3s ease-in-out !important;
}

button:hover .dsh-icon-mic, .dsh-icon-mic:hover, [role="button"]:hover .dsh-icon-mic {
  animation: lucide-mic-pulse 0.4s ease-in-out !important;
}

button:hover .dsh-icon-restore, .dsh-icon-restore:hover, [role="button"]:hover .dsh-icon-restore {
  animation: lucide-restore-bounce 0.35s ease-in-out !important;
}

button:hover .dsh-icon-containers, .dsh-icon-containers:hover, [role="button"]:hover .dsh-icon-containers {
  animation: lucide-cube-bounce 0.4s ease-in-out !important;
}

button:hover .dsh-icon-cut, .dsh-icon-cut:hover, [role="button"]:hover .dsh-icon-cut {
  transform: rotate(-15deg) !important;
}

button:hover .dsh-icon-branch, .dsh-icon-branch:hover, [role="button"]:hover .dsh-icon-branch {
  transform: rotate(15deg) !important;
}

.dsh-tree-projectRow:hover .dsh-tree-arrow, .dsh-tree-projectRow:hover svg[class*="chevron"], .dsh-tree-projectRow:hover svg[class*="arrow"] {
  transform: translateX(1.5px) !important;
}
.dsh-tree-projectRow:hover .dsh-tree-arrowOpen {
  transform: rotate(90deg) translateY(-1px) !important;
}

.dsh-model-star-btn {
  transition: color 150ms ease, opacity 150ms ease;
  cursor: pointer;
}
.dsh-model-star-btn:hover {
  opacity: 1;
}

@keyframes dsh-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.dsh-spinning {
  animation: dsh-spin 1s linear infinite !important;
}
.dsh-tree-sessionTitle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  margin-left: 4px;
}
.dsh-term-tabs::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
.dsh-term-tabs {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}
`;

    var stylesInjected = false;
    /** ensureTreeStyles implementation. */
    function ensureTreeStyles() {
      if (stylesInjected || typeof document === "undefined") return;
      var el = document.createElement("style");
      el.textContent = TREE_STYLES;
      document.head.appendChild(el);
      stylesInjected = true;
    }

    var modelDecoratorInstalled = false;
    /**
     * Ensures that the model picker decoration is installed in the document.
     *
     * Guarantees that the model picker decoration is only installed once, even if the document or MutationObserver is undefined.
     * Returns nothing but sets the `modelDecoratorInstalled` flag to true.
     * On failure (e.g., due to undefined document or MutationObserver), does nothing.
     */
    function ensureModelPickerDecoration() {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
      if (modelDecoratorInstalled) return;
      modelDecoratorInstalled = true;

      /**
       * Guarantees that the favorite models are retrieved from local storage if available,
       * and updates them back to local storage if changes are made.
       * Returns the current list of favorite models.
       * On failure (e.g., due to an error during retrieval or storage), returns an empty array.
       */
      var getFavoriteModels = function () {
        try {
          var raw = window.localStorage.getItem("dsh_favorite_models");
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          return [];
        }
      };

      /**
       * Guarantees that the favorite models are updated in local storage if provided with a new list,
       * and retrieves the current list of favorite models.
       * Returns the current list of favorite models.
       * On failure (e.g., due to an error during storage or retrieval), returns an empty array.
       */
      var setFavoriteModels = function (favs) {
        try {
          window.localStorage.setItem("dsh_favorite_models", JSON.stringify(favs));
        } catch (e) {}
      };

      var STAR_GRAY_SVG =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      var STAR_GOLD_SVG =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="#eab308" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

      var updateTimer = null;
      /**
       * Schedules an update to the model decorations.
       * Guarantees that the update will occur after a short delay, ensuring that
       * any previous updates are cleared.
       * On failure (e.g., due to an error during the update process), the function
       * does not return anything, but the update will still be attempted.
       */
      var scheduleUpdate = function () {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(updateModelDecorations, 100);
      };

      /**
       * Updates the model decorations with the latest favorite models.
       * Guarantees that the decorations are updated after a short delay, ensuring
       * that any previous updates are cleared.
       * On failure (e.g., due to an error during the update process), the function
       * does not return anything, but the update will still be attempted.
       */
      var updateModelDecorations = function () {
        // 1. Remove old inline brand icons if any
        var oldBrandIcons = document.querySelectorAll(".dsh-prov-brand-icon");
        oldBrandIcons.forEach(function (icon) {
          icon.remove();
        });

        // 2. Decorate model dropdown options with Star/Favorite buttons and build Favorites group at top
        var modelMenus = document.querySelectorAll(
          '[role="menu"][id*="menu"], [class*="ModelSelect_menu"]',
        );
        modelMenus.forEach(function (menu) {
          var options = menu.querySelectorAll(
            'button[role="menuitemradio"], button[class*="option"]',
          );
          if (options.length === 0) return;

          var favs = getFavoriteModels();
          var groupsContainer = menu.querySelector('[class*="groups"]') || menu;
          var favOptionsMap = {};

          /**
           * Stops all ongoing updates to the model decorations.
           * Guarantees that any previous updates are cleared.
           * On failure (e.g., due to an error during the update process), the function
           * does not return anything, but the update will still be attempted.
           */
          var stopAll = function (e) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
              if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            }
          };

          options.forEach(function (opt) {
            if (opt.closest(".dsh-favorites-group")) return;

            var modelNameEl = opt.querySelector('[class*="modelName"]') || opt;
            var modelKey = (opt.getAttribute("title") || modelNameEl.textContent || "").trim();
            if (!modelKey) return;

            var isFav = favs.indexOf(modelKey) !== -1;
            if (isFav) {
              favOptionsMap[modelKey] = opt;
            }

            var starBtn = opt.querySelector(".dsh-model-star-btn");
            if (!starBtn) {
              starBtn = document.createElement("span");
              starBtn.setAttribute("role", "button");
              starBtn.setAttribute("tabindex", "0");
              starBtn.className = "dsh-model-star-btn";
              starBtn.style.border = "none";
              starBtn.style.background = "transparent";
              starBtn.style.padding = "0";
              starBtn.style.width = "20px";
              starBtn.style.height = "20px";
              starBtn.style.cursor = "pointer";
              starBtn.style.display = "inline-flex";
              starBtn.style.alignItems = "center";
              starBtn.style.justifyContent = "center";
              starBtn.style.flex = "0 0 20px";
              starBtn.style.flexShrink = "0";
              starBtn.style.marginLeft = "auto";
              starBtn.style.zIndex = "10";

              /**
               * Toggles the favorite status of a model.
               * Guarantees that the model's favorite status is updated.
               * On failure (e.g., due to an error during the update process), the function
               * does not return anything, but the update will still be attempted.
               */
              var toggleFav = function (e) {
                stopAll(e);
                var currentFavs = getFavoriteModels();
                var idx = currentFavs.indexOf(modelKey);
                if (idx === -1) currentFavs.push(modelKey);
                else currentFavs.splice(idx, 1);
                setFavoriteModels(currentFavs);
                scheduleUpdate();
              };

              starBtn.addEventListener("pointerdown", function (e) {
                stopAll(e);
                toggleFav(e);
              });
              starBtn.addEventListener("mousedown", function (e) {
                stopAll(e);
              });
              starBtn.addEventListener("pointerup", function (e) {
                stopAll(e);
              });
              starBtn.addEventListener("mouseup", function (e) {
                stopAll(e);
              });
              starBtn.addEventListener("click", function (e) {
                stopAll(e);
              });

              var copyEl = opt.querySelector('[class*="optionCopy"]');
              var checkEl = opt.querySelector('[class*="check"]');
              if (checkEl) {
                opt.insertBefore(starBtn, checkEl);
                if (!checkEl.querySelector("svg") && !checkEl.textContent.trim()) {
                  checkEl.style.display = "none";
                } else {
                  checkEl.style.display = "grid";
                }
              } else if (copyEl && copyEl.nextSibling) {
                opt.insertBefore(starBtn, copyEl.nextSibling);
              } else {
                opt.appendChild(starBtn);
              }
            } else {
              var checkElExisting = opt.querySelector('[class*="check"]');
              if (checkElExisting) {
                if (!checkElExisting.querySelector("svg") && !checkElExisting.textContent.trim()) {
                  checkElExisting.style.display = "none";
                } else {
                  checkElExisting.style.display = "grid";
                }
              }
            }

            starBtn.title = isFav ? "Remove from Favorites" : "Add to Favorites";
            starBtn.style.color = isFav ? "#eab308" : "var(--dsw-alias-label-tertiary, #888)";
            starBtn.innerHTML = isFav ? STAR_GOLD_SVG : STAR_GRAY_SVG;
          });

          // Build or update Favorites section at top of menu
          var existingFavGroup = groupsContainer.querySelector(".dsh-favorites-group");
          var favKeys = Object.keys(favOptionsMap);

          if (favKeys.length === 0) {
            if (existingFavGroup) existingFavGroup.remove();
          } else {
            if (!existingFavGroup) {
              existingFavGroup = document.createElement("section");
              existingFavGroup.className = "dsh-favorites-group";
              existingFavGroup.setAttribute("role", "group");
              existingFavGroup.style.display = "flex";
              existingFavGroup.style.flexDirection = "column";
              existingFavGroup.style.marginBottom = "6px";
              existingFavGroup.style.paddingBottom = "4px";
              existingFavGroup.style.borderBottom =
                "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))";

              var titleDiv = document.createElement("div");
              titleDiv.className = "dsh-favorites-title";
              titleDiv.style.padding = "4px 10px 2px";
              titleDiv.style.fontSize = "10.5px";
              titleDiv.style.fontWeight = "700";
              titleDiv.style.color = "#eab308";
              titleDiv.style.textTransform = "uppercase";
              titleDiv.style.letterSpacing = "0.5px";
              titleDiv.style.display = "flex";
              titleDiv.style.alignItems = "center";
              titleDiv.style.gap = "4px";
              titleDiv.innerHTML = "<span>★ Favorites</span>";
              existingFavGroup.appendChild(titleDiv);

              groupsContainer.insertBefore(existingFavGroup, groupsContainer.firstChild);
            }

            var oldClones = existingFavGroup.querySelectorAll(".dsh-fav-cloned-option");
            oldClones.forEach(function (c) {
              c.remove();
            });

            favKeys.forEach(function (key) {
              var origOpt = favOptionsMap[key];
              if (!origOpt) return;
              var clone = origOpt.cloneNode(true);
              clone.className = origOpt.className + " dsh-fav-cloned-option";
              clone.addEventListener("click", function (e) {
                if (e.target.closest(".dsh-model-star-btn")) return;
                origOpt.click();
              });

              var cloneStar = clone.querySelector(".dsh-model-star-btn");
              if (cloneStar) {
                /**
                 * Toggles the visibility of a favorites group in the document.
                 *
                 * This function creates a new favorites group if one does not exist and appends it to the document.
                 * It returns the existing or newly created favorites group.
                 *
                 * If the favorites group does not exist, it is created and appended to the document with a title.
                 */
                var handleCloneToggle = function (e) {
                  stopAll(e);
                  var currentFavs = getFavoriteModels();
                  var idx = currentFavs.indexOf(key);
                  if (idx !== -1) {
                    currentFavs.splice(idx, 1);
                    setFavoriteModels(currentFavs);
                    scheduleUpdate();
                  }
                };
                cloneStar.addEventListener("pointerdown", function (e) {
                  stopAll(e);
                  handleCloneToggle(e);
                });
                cloneStar.addEventListener("mousedown", function (e) {
                  stopAll(e);
                });
                cloneStar.addEventListener("pointerup", function (e) {
                  stopAll(e);
                });
                cloneStar.addEventListener("mouseup", function (e) {
                  stopAll(e);
                });
                cloneStar.addEventListener("click", function (e) {
                  stopAll(e);
                });
              }

              var cloneCheck = clone.querySelector('[class*="check"]');
              if (cloneCheck) {
                if (!cloneCheck.querySelector("svg") && !cloneCheck.textContent.trim()) {
                  cloneCheck.style.display = "none";
                } else {
                  cloneCheck.style.display = "grid";
                }
              }
              existingFavGroup.appendChild(clone);
            });
          }
        });
      };

      var observer = new MutationObserver(scheduleUpdate);
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
      scheduleUpdate();
    }

    var PROVIDERS_CATALOG = [
      {
        id: "antigravity",
        name: "Google Antigravity",
        category: "ai",
        description: "Google Antigravity project credentials & multi-model quota pools",
        prefixes: ["ANTIGRAVITY_"],
        defaultKeys: ["ANTIGRAVITY_PROJECT"],
        probeIds: ["antigravity-sub"],
        oauthProviderId: null,
        hasSubscription: true,
        hasDualAntigravityQuotas: true,
        models: [
          {
            id: "gemini-3.7-flash",
            name: "Gemini 3.7 Flash",
            context: "1M",
            tags: ["Reasoning", "Agentic Coding", "Multimodal"],
            isDefault: true,
          },
          {
            id: "gemini-3.6-flash",
            name: "Gemini 3.6 Flash",
            context: "1M",
            tags: ["Fast", "Multimodal", "Tools"],
          },
          {
            id: "gemini-3.1-pro",
            name: "Gemini 3.1 Pro",
            context: "1M",
            tags: ["Deep Reasoning", "Architecture", "1M Context"],
          },
        ],
      },
      {
        id: "ollama",
        name: "Ollama (Local Inference)",
        category: "ai",
        description:
          "Local model runner on host (127.0.0.1:11434) running Qwen 2.5/3.8, DeepSeek R1 & Llama 3",
        prefixes: ["OLLAMA_"],
        defaultKeys: ["OLLAMA_HOST"],
        probeIds: ["ollama-local"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          {
            id: "qwen3.8:27b",
            name: "Qwen 3.8 27B",
            context: "262k",
            tags: ["27.3B Q4_K_M", "Tools", "Thinking", "Vision", "Coding"],
            isDefault: true,
          },
        ],
      },
      {
        id: "anthropic",
        name: "Anthropic / Claude",
        category: "ai",
        description: "Claude Code embedded runner, subscription OAuth, and Anthropic API keys",
        prefixes: ["CLAUDE_", "ANTHROPIC_"],
        defaultKeys: ["CLAUDE_SUB_OAUTH_TOKEN", "CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
        probeIds: ["claude-sub", "anthropic-api"],
        oauthProviderId: "claude",
        hasSubscription: true,
        models: [
          {
            id: "claude-3-7-sonnet",
            name: "Claude 3.7 Sonnet",
            context: "200k",
            tags: ["Reasoning", "Coding", "Vision", "Tools"],
            isDefault: true,
          },
          {
            id: "claude-3-5-sonnet",
            name: "Claude 3.5 Sonnet",
            context: "200k",
            tags: ["Coding", "Vision", "Tools"],
          },
          {
            id: "claude-3-5-haiku",
            name: "Claude 3.5 Haiku",
            context: "200k",
            tags: ["Fast", "Tools"],
          },
          {
            id: "claude-3-opus",
            name: "Claude 3 Opus",
            context: "200k",
            tags: ["Reasoning", "Analysis"],
          },
        ],
      },
      {
        id: "openai",
        name: "OpenAI / ChatGPT",
        category: "ai",
        description: "ChatGPT Codex subscription tokens and OpenAI platform API keys",
        prefixes: ["OPENAI_", "CODEX_CHATGPT_"],
        defaultKeys: ["OPENAI_API_KEY", "CODEX_CHATGPT_ACCESS_TOKEN"],
        probeIds: ["openai-api"],
        oauthProviderId: null,
        hasSubscription: true,
        models: [
          {
            id: "gpt-4o",
            name: "GPT-4o (Omni)",
            context: "128k",
            tags: ["Multimodal", "Fast", "Tools"],
            isDefault: true,
          },
          {
            id: "gpt-4o-mini",
            name: "GPT-4o Mini",
            context: "128k",
            tags: ["Fast", "Lightweight"],
          },
          { id: "o1", name: "OpenAI o1", context: "200k", tags: ["Deep Reasoning", "STEM"] },
          { id: "o3-mini", name: "OpenAI o3-mini", context: "200k", tags: ["Reasoning", "Coding"] },
        ],
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        category: "ai",
        description: "DeepSeek platform API key (DeepSeek V3 & R1)",
        prefixes: ["DEEPSEEK_"],
        defaultKeys: ["DEEPSEEK_API_KEY"],
        probeIds: ["deepseek-api"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          {
            id: "deepseek-chat",
            name: "DeepSeek-V3",
            context: "64k",
            tags: ["671B MoE", "Coding", "General"],
            isDefault: true,
          },
          {
            id: "deepseek-reasoner",
            name: "DeepSeek-R1",
            context: "64k",
            tags: ["Reasoning", "Math", "Logic"],
          },
        ],
      },
      {
        id: "google",
        name: "Google Gemini",
        category: "ai",
        description: "Google Gemini OAuth tokens and Gemini API keys",
        prefixes: ["GEMINI_"],
        defaultKeys: ["GEMINI_SUB_OAUTH_TOKEN", "GEMINI_API_KEY"],
        probeIds: ["gemini-sub", "gemini-api"],
        oauthProviderId: null,
        hasSubscription: true,
        models: [
          {
            id: "gemini-2.0-flash",
            name: "Gemini 2.0 Flash",
            context: "1M",
            tags: ["Multimodal", "Realtime", "Tools"],
            isDefault: true,
          },
          {
            id: "gemini-2.0-pro-exp",
            name: "Gemini 2.0 Pro",
            context: "2M",
            tags: ["Complex Reasoning", "Coding"],
          },
          {
            id: "gemini-1.5-pro",
            name: "Gemini 1.5 Pro",
            context: "2M",
            tags: ["2M Context", "Analysis"],
          },
        ],
      },
      {
        id: "grok",
        name: "xAI / Grok",
        category: "ai",
        description: "Grok subscription OAuth and xAI API keys",
        prefixes: ["GROK_", "XAI_"],
        defaultKeys: ["GROK_SUB_OAUTH_TOKEN", "XAI_API_KEY"],
        probeIds: ["grok-sub", "grok-api"],
        oauthProviderId: "grok",
        hasSubscription: true,
        models: [
          {
            id: "grok-2",
            name: "Grok 2",
            context: "128k",
            tags: ["Reasoning", "Realtime Search"],
            isDefault: true,
          },
          {
            id: "grok-2-vision",
            name: "Grok 2 Vision",
            context: "32k",
            tags: ["Vision", "Multimodal"],
          },
        ],
      },
      {
        id: "kimi",
        name: "Moonshot / Kimi",
        category: "ai",
        description: "Kimi subscription OAuth and Moonshot API keys",
        prefixes: ["KIMI_"],
        defaultKeys: ["KIMI_SUB_OAUTH_TOKEN", "KIMI_API_KEY"],
        probeIds: ["kimi-sub"],
        oauthProviderId: "kimi",
        hasSubscription: true,
        models: [
          {
            id: "kimi-k1.5",
            name: "Kimi k1.5",
            context: "128k",
            tags: ["Long Context", "Reasoning"],
            isDefault: true,
          },
          { id: "moonshot-v1-128k", name: "Moonshot v1 128k", context: "128k", tags: ["Analysis"] },
          { id: "moonshot-v1-32k", name: "Moonshot v1 32k", context: "32k", tags: ["Fast"] },
        ],
      },
      {
        id: "cursor",
        name: "Cursor",
        category: "ai",
        description: "Cursor subscription token and embedded runner",
        prefixes: ["CURSOR_"],
        defaultKeys: ["CURSOR_SUB_TOKEN", "CURSOR_EMAIL"],
        probeIds: [],
        oauthProviderId: "cursor",
        hasSubscription: true,
        models: [
          {
            id: "cursor-fast",
            name: "Cursor Fast",
            context: "128k",
            tags: ["Autocompletion", "Edit"],
            isDefault: true,
          },
          { id: "cursor-small", name: "Cursor Small", context: "64k", tags: ["Speed"] },
        ],
      },
      {
        id: "github",
        name: "GitHub Platform",
        category: "platform",
        description:
          "GitHub CLI, Copilot bridge, and repository integrations (Account: marius-patrik)",
        prefixes: ["GITHUB_"],
        defaultKeys: ["GITHUB_OAUTH_TOKEN", "GITHUB_USER"],
        probeIds: [],
        oauthProviderId: "github",
        hasSubscription: true,
        models: [
          {
            id: "copilot-chat",
            name: "Copilot Chat",
            context: "128k",
            tags: ["Coding", "Workspace"],
            isDefault: true,
          },
        ],
      },
      {
        id: "zen",
        name: "OpenCode Zen",
        category: "ai",
        description: "OpenCode Zen API key and smart routing",
        prefixes: ["ZEN_"],
        defaultKeys: ["ZEN_API_KEY"],
        probeIds: ["zen"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          {
            id: "zen-big-picker",
            name: "Zen Big Picker",
            context: "128k",
            tags: ["Smart Routing"],
            isDefault: true,
          },
          { id: "zen-fast", name: "Zen Fast", context: "64k", tags: ["Low Latency"] },
        ],
      },
      {
        id: "mistral",
        name: "Mistral",
        category: "ai",
        description: "Mistral platform API key",
        prefixes: ["MISTRAL_"],
        defaultKeys: ["MISTRAL_API_KEY"],
        probeIds: ["mistral-api"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          { id: "mistral-large-latest", name: "Mistral Large", context: "128k", tags: ["General"] },
          { id: "mistral-medium-latest", name: "Mistral Medium", context: "128k", tags: ["Fast"] },
        ],
      },
      {
        id: "groq",
        name: "Groq",
        category: "ai",
        description: "Groq platform API key",
        prefixes: ["GROQ_"],
        defaultKeys: ["GROQ_API_KEY"],
        probeIds: ["groq-api"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          {
            id: "qwen/qwen3.8-27b",
            name: "Qwen 3.8 27B",
            context: "128k",
            tags: ["Fast", "Tools"],
          },
          { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", context: "128k", tags: ["Reasoning"] },
        ],
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        category: "ai",
        description: "OpenRouter API key and proxy routing",
        prefixes: ["OPENROUTER_"],
        defaultKeys: ["OPENROUTER_API_KEY"],
        probeIds: ["openrouter-api"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", context: "128k", tags: ["Fast"] },
          {
            id: "anthropic/claude-sonnet-4.5",
            name: "Claude Sonnet 4.5",
            context: "1M",
            tags: ["Reasoning"],
          },
        ],
      },
      {
        id: "cerebras",
        name: "Cerebras",
        category: "ai",
        description: "Cerebras API key",
        prefixes: ["CEREBRAS_"],
        defaultKeys: ["CEREBRAS_API_KEY"],
        probeIds: ["cerebras-api"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          { id: "llama-4-scout-17b-16e", name: "Llama 4 Scout", context: "128k", tags: ["Fast"] },
          {
            id: "llama-4-maverick-17b-128e",
            name: "Llama 4 Maverick",
            context: "128k",
            tags: ["Reasoning"],
          },
        ],
      },
      {
        id: "zai",
        name: "Z.ai / GLM",
        category: "ai",
        description: "Z.ai (GLM) API key",
        prefixes: ["ZAI_"],
        defaultKeys: ["ZAI_API_KEY"],
        probeIds: ["zai-api"],
        oauthProviderId: null,
        hasSubscription: false,
        models: [
          { id: "glm-5.3-flash", name: "GLM 5.3 Flash", context: "128k", tags: ["Fast"] },
          { id: "glm-5.3", name: "GLM 5.3", context: "128k", tags: ["Reasoning"] },
        ],
      },
    ];

    // Vendor bases already rendered by a PROVIDERS_CATALOG card above (every
    // shipped route this plugin owns a built-in probe for). Anything a live
    // snapshot names outside this set is a route this catalog never learned
    // about at all -- above all the numbered multi-account custom providers
    // (openrouter-2, groq-3, ...) a user adds through model settings -- and
    // gets its own card in the "Custom & Multi-Account Providers" section
    // instead of silently having no quota surface anywhere (#164).
    var COVERED_VENDOR_IDS = {};
    PROVIDERS_CATALOG.forEach(function (p) {
      (p.probeIds || []).forEach(function (id) {
        COVERED_VENDOR_IDS[quotaWidgets.vendorBaseId(id)] = true;
      });
    });

    /**
     * Provides configuration details for different subscription models.
     *
     * Returns an array of subscription models, each with an ID, name, context, tags, and other metadata.
     *
     * @returns {Array<{ id: string, name: string, context: string, tags: string[], isDefault: boolean }>}
     *   An array of subscription models with their IDs, names, contexts, tags, and default status.
     */
    var ProvidersGlyph = createGlyphComponent(
      16,
      "dsh-icon-providers",
      false,
      true,
      false,
      function () {
        return [
          h("line", { x1: "22", x2: "2", y1: "12", y2: "12" }),
          h("path", {
            d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
          }),
          h("line", { x1: "6", x2: "6.01", y1: "16", y2: "16" }),
          h("line", { x1: "10", x2: "10.01", y1: "16", y2: "16" }),
        ];
      },
    );

    /**
     * Represents a platform model with configuration details for integrations.
     *
     * Contains information about the platform's context, tags, and default keys.
     * Guarantees that the `models` array includes platform-specific terminal glyphs.
     *
     * On failure, the object may lack required fields or have invalid configurations.
     */
    var TerminalsGlyph = createGlyphComponent(
      16,
      "dsh-icon-terminal",
      false,
      true,
      false,
      function () {
        return [
          h("polyline", { points: "4 17 10 11 4 5" }),
          h("line", { x1: "12", x2: "20", y1: "19", y2: "19" }),
        ];
      },
    );

    /**
     * Represents a configuration for a platform or service integration.
     *
     * Contains metadata like ID, name, category, and description, along with
     * configuration keys and subscription status. Also includes models for
     * specific service features.
     */
    var ContainersGlyph = createGlyphComponent(
      16,
      "dsh-icon-containers",
      false,
      true,
      false,
      function () {
        return [
          h("path", {
            d: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
          }),
          h("path", { d: "m7 16.5-4.74-2.85" }),
          h("path", { d: "m7 16.5 5-3" }),
          h("path", { d: "M7 16.5v5.17" }),
          h("path", {
            d: "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
          }),
          h("path", { d: "m17 16.5-5-3" }),
          h("path", { d: "m17 16.5 4.74-2.85" }),
          h("path", { d: "M17 16.5v5.17" }),
          h("path", {
            d: "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
          }),
          h("path", { d: "M12 8 7.26 5.15" }),
          h("path", { d: "m12 8 4.74-2.85" }),
          h("path", { d: "M12 13.5V8" }),
        ];
      },
    );

    /** ToolsGlyph implementation. */
    var ToolsGlyph = createGlyphComponent(16, "dsh-icon-tools", false, true, false, function () {
      return [
        h("path", {
          d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
        }),
      ];
    });

    /**
     * Provides configuration details for different subscription models.
     *
     * Returns an array of subscription models, each containing an ID, name, context, tags, and a boolean indicating if it's the default model.
     *
     * @returns {Array<{ id: string, name: string, context: string, tags: string[], isDefault: boolean }>} An array of subscription models with their IDs, names, contexts, tags, and default status.
     */
    var LoopsGlyph = createGlyphComponent(16, "dsh-icon-refresh", false, true, false, function () {
      return [
        h("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
        h("path", { d: "M21 3v5h-5" }),
        h("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
        h("path", { d: "M8 16H3v5" }),
      ];
    });

    /**
     * Creates a glyph component for the "dsh-icon-providers" with specific styling and path configurations.
     *
     * @returns {React.ReactElement} A React element representing the glyph with lines and paths.
     *   The glyph includes a right triangle fill and two vertical lines.
     *   Fails if the returned React element is not properly rendered or styled.
     */
    var TriangleRightFill14 = createGlyphComponent(
      14,
      "dsh-icon-chevron",
      true,
      true,
      false,
      function () {
        return [h("polyline", { points: "9 18 15 12 9 6" })];
      },
    );

    /**
     * Represents a platform model with configuration details for integrations.
     *
     * Guarantees that the `models` array includes platform-specific terminal glyphs.
     * On failure, the object may lack required fields or have invalid configurations.
     */
    var PassGlyph = createGlyphComponent(16, "dsh-icon-pass", false, true, false, function () {
      return [
        h("circle", { cx: "7.5", cy: "15.5", r: "5.5" }),
        h("path", { d: "m21 2-9.6 9.6" }),
        h("path", { d: "m15.5 7.5 3 3L22 7l-3-3" }),
      ];
    });

    /** DataGlyph implementation. */
    var DataGlyph = createGlyphComponent(16, "dsh-icon-data", false, true, false, function () {
      return [
        h("polygon", { points: "12 2 2 7 12 12 22 7 12 2" }),
        h("polyline", { points: "2 17 12 22 22 17" }),
        h("polyline", { points: "2 12 12 17 22 12" }),
      ];
    });

    /**
     * Represents a platform or service integration configuration.
     *
     * Guarantees metadata such as ID, name, category, and description, along with
     * configuration keys and subscription status. Models ensure platform-specific
     * terminal glyphs are included. On failure, metadata or models may be missing
     * or improperly configured.
     */
    var ChatGlyph = createGlyphComponent(16, "dsh-icon-chat", false, true, false, function () {
      return [h("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })];
    });

    /** RefreshGlyph implementation. */
    var RefreshGlyph = createGlyphComponent(
      16,
      "dsh-icon-refresh",
      false,
      true,
      false,
      function () {
        return [
          h("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
          h("path", { d: "M21 3v5h-5" }),
          h("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
          h("path", { d: "M8 16H3v5" }),
        ];
      },
    );

    /**
     * Renders a glyph with paths for containers, including various SVG path elements.
     * The glyph is not interactive and serves as a visual representation of containers.
     * It returns the SVG structure composed of multiple path elements.
     */
    var TrashGlyph = createGlyphComponent(16, "dsh-icon-trash", false, true, false, function () {
      return [
        h("path", { d: "M3 6h18" }),
        h("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }),
        h("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }),
        h("line", { x1: "10", x2: "10", y1: "11", y2: "17" }),
        h("line", { x1: "14", x2: "14", y1: "11", y2: "17" }),
      ];
    });

    /**
     * Represents the tools icon glyph.
     * Returns an array of SVG path elements representing the tools icon.
     * Fails if the path data is malformed or the function is called incorrectly.
     */
    var EditGlyph = createGlyphComponent(16, "dsh-icon-edit", false, true, false, function () {
      return [
        h("path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }),
        h("path", { d: "m15 5 4 4" }),
      ];
    });

    /**
     * Creates a SVG glyph component for the tools icon.
     *
     * Returns an array of SVG path elements representing the tools icon.
     *
     * On failure, returns an empty array.
     */
    var FileGlyph = createGlyphComponent(14, "dsh-icon-file", false, true, false, function () {
      return [
        h("path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }),
        h("path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }),
      ];
    });

    /**
     * Creates a custom SVG glyph component.
     *
     * Returns an array of SVG path elements.
     *
     * @returns {Array<SVGElement>} An array of SVG path elements representing the glyph.
     */
    var SubagentGlyph = createGlyphComponent(
      12,
      "dsh-icon-subagent",
      false,
      true,
      false,
      function () {
        return [
          h("circle", { cx: "12", cy: "18", r: "3" }),
          h("circle", { cx: "6", cy: "6", r: "3" }),
          h("circle", { cx: "18", cy: "6", r: "3" }),
          h("path", { d: "M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" }),
          h("path", { d: "M12 12v3" }),
        ];
      },
    );

    /**
     * Creates a glyph component for the "CutGlyph" with specific styling and path configurations.
     *
     * @returns {React.ReactElement} A React element representing the glyph with a right triangle fill and two vertical lines.
     *   Fails if the returned React element is not properly rendered or styled.
     */
    var CutGlyph = createGlyphComponent(13, "dsh-icon-cut", false, false, false, function () {
      return [
        h("circle", { cx: "6", cy: "6", r: "3" }),
        h("circle", { cx: "6", cy: "18", r: "3" }),
        h("line", { x1: "20", y1: "4", x2: "8.12", y2: "15.88" }),
        h("line", { x1: "14.47", y1: "14.48", x2: "20", y2: "20" }),
        h("line", { x1: "8.12", y1: "8.12", x2: "12", y2: "12" }),
      ];
    });

    /**
     * Creates a glyph component for the specified icon with customizable styling.
     *
     * @returns {React.ReactElement} A React element representing the glyph, ensuring proper rendering and styling.
     * Fails if the returned React element does not meet the expected icon configuration or styling.
     */
    var CopyGlyph = createGlyphComponent(13, "dsh-icon-copy", false, false, false, function () {
      return [
        h("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }),
        h("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }),
      ];
    });

    /**
     * Creates a platform model with configuration details for integrations.
     *
     * @returns {PlatformModel} A platform model object that includes platform-specific terminal glyphs.
     *   Guarantees the presence of `models` with properly configured glyphs.
     *   Fails if the `models` array is missing or contains invalid configurations.
     */
    var PlusGlyph = createGlyphComponent(14, "dsh-icon-plus", false, false, false, function () {
      return [h("path", { d: "M5 12h14" }), h("path", { d: "M12 5v14" })];
    });

    /**
     * Represents an ellipsis glyph.
     *
     * @returns {React.ReactElement} A React element representing the ellipsis glyph.
     *   Guarantees that the returned React element is properly rendered with lines and paths.
     *   Fails if the returned React element is not correctly rendered or styled.
     */
    var EllipsisGlyph = createGlyphComponent(
      14,
      "dsh-icon-ellipsis",
      false,
      false,
      false,
      function () {
        return [
          h("circle", { cx: "12", cy: "12", r: "1" }),
          h("circle", { cx: "19", cy: "12", r: "1" }),
          h("circle", { cx: "5", cy: "12", r: "1" }),
        ];
      },
    );

    /**
     * Represents a platform or service integration configuration.
     *
     * Guarantees metadata including ID, name, category, and description. On failure,
     * the object may lack required fields or have invalid configurations.
     */
    var EyeGlyph = createGlyphComponent(14, "dsh-icon-eye", false, false, false, function () {
      return [
        h("path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" }),
        h("circle", { cx: "12", cy: "12", r: "3" }),
      ];
    });

    /** DockToggleGlyph implementation. */
    var DockToggleGlyph = createGlyphComponent(
      14,
      "dsh-icon-dock",
      true,
      false,
      false,
      function () {
        return [
          h("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }),
          h("path", { d: "M9 3v18" }),
        ];
      },
    );

    /** PanelBottomGlyph implementation. */
    var PanelBottomGlyph = createGlyphComponent(
      14,
      "dsh-icon-panel-bottom",
      true,
      false,
      false,
      function () {
        return [
          h("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }),
          h("line", { x1: "3", x2: "21", y1: "15", y2: "15" }),
        ];
      },
    );

    /**
     * Guarantees a platform-specific terminal glyph with metadata including ID, name,
     * category, and description. On failure, metadata or the glyph may be missing or
     * improperly configured.
     */
    var PanelRightGlyph = createGlyphComponent(
      14,
      "dsh-icon-dock",
      true,
      false,
      false,
      function () {
        return [
          h("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }),
          h("line", { x1: "15", x2: "15", y1: "3", y2: "21" }),
        ];
      },
    );

    /**
     * Renders a visual representation of containers using SVG path elements.
     * The glyph is not interactive and serves as a static visual icon.
     * Returns an SVG structure composed of multiple path elements.
     * Fails if the SVG structure cannot be generated, returning an empty array.
     */
    var BranchGlyph = createGlyphComponent(14, "dsh-icon-branch", false, false, false, function () {
      return [
        h("line", { x1: "6", x2: "6", y1: "3", y2: "15" }),
        h("circle", { cx: "18", cy: "6", r: "3" }),
        h("circle", { cx: "6", cy: "18", r: "3" }),
        h("path", { d: "M18 9a9 9 0 0 1-9 9" }),
      ];
    });

    /**
     * Renders a visual representation of a folder open state using SVG path elements.
     * Returns an SVG structure composed of multiple path elements, forming the glyph.
     * The glyph is not interactive and serves as a static visual representation.
     */
    var FolderOpenGlyph = createGlyphComponent(
      14,
      "dsh-icon-folder",
      false,
      false,
      false,
      function () {
        return [
          h("path", {
            d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
          }),
        ];
      },
    );

    // Relocated ahead of its original position (which sat after
    // TopConversationTabBar) so client-main-area-tab-bar.js's wiring call can
    // capture it: dependencies passed into a __dshCreate* factory are read
    // once, at the wiring call site, so every var it references must already
    // be assigned by then.
    var RepoGlyph = createDecoratedGlyphComponent(
      15,
      "",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [
          h("line", { x1: "6", x2: "6", y1: "3", y2: "15" }),
          h("circle", { cx: "18", cy: "6", r: "3" }),
          h("circle", { cx: "6", cy: "18", r: "3" }),
          h("path", { d: "M18 9a9 9 0 0 1-9 9" }),
        ];
      },
    );

    /**
     * Creates a SVG glyph component for the tools icon.
     *
     * Returns an array of SVG path elements representing the tools icon.
     * Fails if the path data is malformed or the function is called incorrectly.
     */
    var SearchGlyph = createGlyphComponent(14, "dsh-icon-search", false, false, false, function () {
      return [h("circle", { cx: "11", cy: "11", r: "8" }), h("path", { d: "m21 21-4.3-4.3" })];
    });

    /**
     * Represents the mic icon glyph.
     * Returns an array of SVG path elements representing the mic icon.
     * Fails if the path data is malformed or the function is called incorrectly.
     */
    var MicGlyph = createGlyphComponent(14, "dsh-icon-mic", true, false, false, function () {
      return [
        h("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" }),
        h("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
        h("line", { x1: "12", x2: "12", y1: "19", y2: "22" }),
      ];
    });

    /**
     * Creates a custom SVG glyph component.
     *
     * Returns an array of SVG path elements representing the glyph.
     * Fails if the path data is malformed or the function is called incorrectly, returning an empty array.
     */
    function formatTokenCount(num) {
      if (num === undefined || num === null || isNaN(num)) return "0";
      if (num >= 1000000000) return (num / 1000000000).toFixed(1) + "B";
      if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
      if (num >= 1000) return (num / 1000).toFixed(1) + "k";
      return String(num);
    }

    // High-speed ANSI to HTML converter
    /**
     * Creates a custom SVG glyph component.
     *
     * Returns an array of SVG path elements representing the glyph.
     *
     * @returns {Array<SVGElement>} An array of SVG path elements.
     * On failure, returns an empty array.
     */
    function ansiToHtml(raw) {
      if (!raw) return "";
      var text = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      var COLOR_MAP = {
        30: "#4e5569",
        31: "#ff7b72",
        32: "#7ee787",
        33: "#f2cc60",
        34: "#79c0ff",
        35: "#d2a8ff",
        36: "#56d4dd",
        37: "#e6edf3",
        90: "#8b949e",
        91: "#ffa198",
        92: "#aff5b4",
        93: "#fbe59e",
        94: "#a5d6ff",
        95: "#e2c5ff",
        96: "#76e3ea",
        97: "#ffffff",
      };

      var BG_MAP = {
        40: "#161b22",
        41: "#b62324",
        42: "#1f6feb",
        43: "#9e6a03",
        44: "#1f6feb",
        45: "#8957e5",
        46: "#1b7c83",
        47: "#8b949e",
      };

      var parts = text.split(/\x1b\[([0-9;]+)m/);
      var html = "";
      var curColor = null;
      var curBg = null;
      var isBold = false;
      var isDim = false;
      var isUnderline = false;

      for (var i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
          var codes = parts[i].split(";");
          for (var c = 0; c < codes.length; c++) {
            var code = parseInt(codes[c], 10);
            if (code === 0) {
              curColor = null;
              curBg = null;
              isBold = false;
              isDim = false;
              isUnderline = false;
            } else if (code === 1) {
              isBold = true;
            } else if (code === 2) {
              isDim = true;
            } else if (code === 4) {
              isUnderline = true;
            } else if (COLOR_MAP[code]) {
              curColor = COLOR_MAP[code];
            } else if (BG_MAP[code]) {
              curBg = BG_MAP[code];
            }
          }
        } else {
          var chunk = parts[i];
          if (chunk) {
            var style = "";
            if (curColor) style += "color:" + curColor + ";";
            if (curBg) style += "background:" + curBg + ";";
            if (isBold) style += "font-weight:700;";
            if (isDim) style += "opacity:0.65;";
            if (isUnderline) style += "text-decoration:underline;";

            if (style) {
              html += '<span style="' + style + '">' + chunk + "</span>";
            } else {
              html += chunk;
            }
          }
        }
      }
      return html;
    }

    /**
     * Represents a platform model with configuration details for integrations.
     *
     * @returns {PlatformModel} A platform model object that includes platform-specific terminal glyphs.
     *   Guarantees the presence of `models` with properly configured glyphs.
     *   Fails if the `models` array is missing or contains invalid configurations.
     */
    function ProviderBrandIcon(props) {
      var id = (props.id || "").toLowerCase();
      var size = props.size || 18;

      var appPath = null;
      if (id === "cursor") appPath = "/Applications/Cursor.app";
      else if (id === "vscode" || id === "code") appPath = "/Applications/Visual Studio Code.app";
      else if (id === "chrome" || id === "google") appPath = "/Applications/Google Chrome.app";
      else if (id === "safari") appPath = "/Applications/Safari.app";
      else if (id === "terminal" || id === "tmux")
        appPath = "/System/Applications/Utilities/Terminal.app";

      if (appPath) {
        return h("img", {
          src: "/quotas/api/fs/icon?path=" + encodeURIComponent(appPath),
          width: size,
          height: size,
          alt: id,
          className: "dsh-icon-animated",
          style: {
            width: size + "px",
            height: size + "px",
            objectFit: "contain",
            display: "inline-flex",
            verticalAlign: "middle",
            flexShrink: 0,
            borderRadius: "3px",
          },
          onError: function (e) {
            e.currentTarget.style.display = "none";
          },
        });
      }

      // If no real native macOS app icon exists on disk, render nothing
      return null;
    }

    // 1a. SETTINGS: ACCOUNTS SECTION
    /**
     * Creates a custom glyph component with specified dimensions, icon class, and a callback for rendering.
     * The callback must return an array of SVG elements, which may be incomplete or invalid.
     *
     * @param {number} size - The size of the glyph.
     * @param {string} className - The class name for the SVG element.
     * @param {boolean} isDock - Indicates if the glyph is for a dock toggle.
     * @param {boolean} isBottom - Indicates if the glyph is for a panel bottom.
     * @param {boolean} isEye - Indicates if the glyph is for an eye icon.
     * @param {function} render - A function that returns an array of SVG elements.
     * @returns {object} A glyph component object that may have missing or invalid configurations.
     */
    function AccountsSection() {
      var state = React.useState({
        accounts: [],
        snapshots: [],
        integrationsMeta: null,
        loading: true,
        error: null,
      });
      var data = state[0],
        setData = state[1];
      var expandedKeysState = React.useState({});
      var expandedKeys = expandedKeysState[0],
        setExpandedKeys = expandedKeysState[1];
      var revealedState = React.useState({});
      var revealed = revealedState[0],
        setRevealed = revealedState[1];
      var editModalState = React.useState(null);
      var editModal = editModalState[0],
        setEditModal = editModalState[1];
      var addKeyModalState = React.useState(null);
      var addKeyModal = addKeyModalState[0],
        setAddKeyModal = addKeyModalState[1];
      var oauthModalState = React.useState(null);
      var oauthModal = oauthModalState[0],
        setOauthModal = oauthModalState[1];
      var probingState = React.useState({});
      var probing = probingState[0],
        setProbing = probingState[1];
      // One shared clock for every reset-timer countdown on this page,
      // instead of a per-row interval: a settings tab can list dozens of
      // accounts across several multi-account providers at once.
      var nowState = React.useState(Date.now());
      var now = nowState[0],
        setNow = nowState[1];
      React.useEffect(function () {
        var timer = setInterval(function () {
          setNow(Date.now());
        }, 30000);
        return function () {
          clearInterval(timer);
        };
      }, []);

      var load = React.useCallback(function () {
        setData(function (s) {
          return Object.assign({}, s, { loading: true });
        });
        Promise.all([
          fetch(VAULT_API + "/accounts")
            .then(function (r) {
              return r.json();
            })
            .catch(function () {
              return { rows: [] };
            }),
          fetch(QUOTAS_API + "/snapshots")
            .then(function (r) {
              return r.json();
            })
            .catch(function () {
              return { snapshots: [] };
            }),
          fetch(QUOTAS_API + "/integrations")
            .then(function (r) {
              return r.json();
            })
            .catch(function () {
              return null;
            }),
        ])
          .then(function (res) {
            setData({
              accounts: (res[0] && res[0].rows) || [],
              snapshots: (res[1] && res[1].snapshots) || [],
              integrationsMeta: res[2] || null,
              loading: false,
              error: null,
            });
          })
          .catch(function (err) {
            setData(function (s) {
              return Object.assign({}, s, { loading: false, error: err.message });
            });
          });
      }, []);

      React.useEffect(
        function () {
          load();
        },
        [load],
      );

      /**
       * Creates a SVG glyph component for an unspecified icon.
       *
       * Returns an array of SVG path elements representing the icon.
       * Fails if the path data is malformed or the function is called incorrectly.
       */
      var handleProbe = function (providerId) {
        setProbing(function (s) {
          var n = Object.assign({}, s);
          n[providerId] = true;
          return n;
        });
        fetch(QUOTAS_API + "/refresh/" + encodeURIComponent(providerId), { method: "POST" })
          .then(function () {
            load();
          })
          .finally(function () {
            setProbing(function (s) {
              var n = Object.assign({}, s);
              n[providerId] = false;
              return n;
            });
          });
      };

      var /** handleProbeAll implementation. */
        handleProbeAll = function () {
          setProbing(function (s) {
            return Object.assign({}, s, { all: true });
          });
          fetch(QUOTAS_API + "/refresh", { method: "POST" })
            .then(function () {
              load();
            })
            .finally(function () {
              setProbing(function (s) {
                var n = Object.assign({}, s);
                n.all = false;
                return n;
              });
            });
        };

      var /** toggleKeys implementation. */
        toggleKeys = function (provId) {
          setExpandedKeys(function (s) {
            var n = Object.assign({}, s);
            n[provId] = !n[provId];
            return n;
          });
        };

      /**
       * Toggles the reveal state of an element.
       *
       * Returns true if the reveal state is successfully toggled; otherwise, returns false.
       */
      var toggleReveal = function (keyId) {
        if (revealed[keyId]) {
          setRevealed(function (s) {
            var n = Object.assign({}, s);
            delete n[keyId];
            return n;
          });
          return;
        }
        var parts = keyId.split("::");
        var ref = parts[0],
          account = parts[1];
        fetch(
          VAULT_API +
            "/accounts/" +
            encodeURIComponent(ref) +
            "?account=" +
            encodeURIComponent(account),
        )
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setRevealed(function (s) {
              var n = Object.assign({}, s);
              n[keyId] = res.value || "(empty)";
              return n;
            });
          });
      };

      // Every vendor a live snapshot names that no PROVIDERS_CATALOG card
      // already covers -- above all the numbered multi-account custom
      // providers (openrouter-2, groq-3, ...) a user adds through model
      // settings -- grouped so every account of the same vendor renders
      // together instead of only the first one a lookup happens to pick.
      var customVendorGroups = quotaWidgets.groupQuotaSnapshotsByVendor(
        (data.snapshots || []).filter(function (s) {
          return !COVERED_VENDOR_IDS[s.vendor || quotaWidgets.vendorBaseId(s.provider)];
        }),
      );

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "900px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
            },
          },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px 0",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Accounts & Credentials",
            ),
            h(
              "div",
              { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Manage AI platform API keys, subscription OAuth logins, and real sliding window token quotas.",
            ),
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            h(
              "button",
              {
                onClick: handleProbeAll,
                disabled: probing.all,
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "7px",
                  background: "var(--dsw-alias-primary, #6366f1)",
                  color: "#fff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: probing.all ? "wait" : "pointer",
                },
              },
              h(RefreshGlyph, { size: 14 }),
              probing.all ? "Probing All…" : "Probe All Health",
            ),
            h(
              "button",
              {
                onClick: load,
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "7px 12px",
                  borderRadius: "7px",
                  background: "var(--dsw-alias-surface-l2, rgba(128,128,128,0.1))",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                  color: "var(--dsw-alias-label-primary)",
                  cursor: "pointer",
                },
              },
              h(RefreshGlyph, { size: 14 }),
            ),
          ),
        ),
        PROVIDERS_CATALOG.filter(function (p) {
          return p.category === "ai" || p.hasSubscription || p.prefixes.length > 0;
        }).map(function (prov) {
          var provRows = (data.accounts || []).filter(function (r) {
            return prov.prefixes.some(function (p) {
              return r.ref && r.ref.startsWith(p);
            });
          });
          var activeSnapshots = (data.snapshots || []).filter(function (s) {
            return prov.probeIds.indexOf(s.provider) !== -1;
          });
          var isConfigured = provRows.length > 0;
          var primarySnap = activeSnapshots[0];
          var status = primarySnap
            ? primarySnap.status
            : isConfigured
              ? "available"
              : "unconfigured";
          var isLiveHealthy = status === "available" || status === "ok";
          var isDegraded = status === "error" || status === "degraded" || status === "rate_limited";
          var isKeysOpen = Boolean(expandedKeys[prov.id]);
          var isClaude = prov.id === "anthropic";
          var isAntigravity = prov.id === "antigravity";
          var claudeStats =
            data.integrationsMeta && data.integrationsMeta.claudeStats
              ? data.integrationsMeta.claudeStats
              : null;
          var antigravityQuotas =
            data.integrationsMeta && data.integrationsMeta.antigravity
              ? data.integrationsMeta.antigravity
              : null;

          return h(
            "div",
            {
              key: prov.id,
              style: {
                borderRadius: "10px",
                border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.18))",
                background: "var(--dsw-alias-surface-l0, rgba(255,255,255,0.02))",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              },
            },
            h(
              "div",
              {
                style: {
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.03))",
                  borderBottom: isKeysOpen
                    ? "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.12))"
                    : "none",
                },
              },
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexWrap: "wrap",
                  },
                },
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "4px" } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "10px" } },
                    h(ProviderBrandIcon, { id: prov.id, size: 22 }),
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "15px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      prov.name,
                    ),
                    h(
                      "span",
                      {
                        style: {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: isLiveHealthy
                            ? "rgba(63, 185, 80, 0.15)"
                            : isDegraded
                              ? "rgba(248, 81, 73, 0.15)"
                              : "rgba(128, 128, 128, 0.12)",
                          color: isLiveHealthy
                            ? "#3fb950"
                            : isDegraded
                              ? "#f85149"
                              : "var(--dsw-alias-label-secondary)",
                        },
                      },
                      h("span", {
                        style: {
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: isLiveHealthy ? "#3fb950" : isDegraded ? "#f85149" : "#888",
                          boxShadow: isLiveHealthy ? "0 0 6px #3fb950" : "none",
                        },
                      }),
                      isLiveHealthy ? "LIVE HEALTHY" : isDegraded ? "DEGRADED" : "UNCONFIGURED",
                    ),
                    prov.hasSubscription
                      ? h(
                          "span",
                          {
                            style: {
                              padding: "2px 7px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background: "rgba(99, 102, 241, 0.12)",
                              color: "var(--dsw-alias-primary, #6366f1)",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                            },
                          },
                          "SUBSCRIPTION",
                        )
                      : null,
                  ),
                  h(
                    "div",
                    { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                    prov.description,
                  ),
                ),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  prov.probeIds.length > 0
                    ? h(
                        "button",
                        {
                          onClick: function () {
                            handleProbe(prov.probeIds[0]);
                          },
                          disabled: probing[prov.probeIds[0]],
                          style: {
                            padding: "5px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            border: "1px solid var(--dsw-alias-border-l2)",
                            background: "var(--dsw-alias-surface-l2)",
                            color: "var(--dsw-alias-label-primary)",
                            cursor: "pointer",
                          },
                        },
                        h(RefreshGlyph, { size: 12 }),
                        probing[prov.probeIds[0]] ? "Testing…" : "Probe Health",
                      )
                    : null,
                  prov.oauthProviderId
                    ? h(
                        "button",
                        {
                          onClick: function () {
                            setOauthModal({ providerId: prov.oauthProviderId, label: prov.name });
                          },
                          style: {
                            padding: "5px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            border: "1px solid #6366f1",
                            background: "rgba(99, 102, 241, 0.1)",
                            color: "#6366f1",
                            cursor: "pointer",
                          },
                        },
                        h(PassGlyph, { size: 12 }),
                        "Sign In (OAuth)",
                      )
                    : null,
                  h(
                    "button",
                    {
                      onClick: function () {
                        setAddKeyModal({ prov: prov, account: "default" });
                      },
                      style: {
                        padding: "5px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        border: "1px solid var(--dsw-alias-border-l2)",
                        background: "var(--dsw-alias-surface-l2)",
                        color: "var(--dsw-alias-label-primary)",
                        cursor: "pointer",
                      },
                    },
                    "+ Add Key",
                  ),
                ),
              ),
              primarySnap && (primarySnap.limit !== undefined || primarySnap.resetsAt !== undefined)
                ? h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        flexWrap: "wrap",
                      },
                    },
                    h(quotaWidgets.QuotaMeterBar, {
                      remaining: primarySnap.remaining,
                      limit: primarySnap.limit,
                      unit: primarySnap.unit,
                    }),
                    h(quotaWidgets.QuotaResetTimer, { resetsAt: primarySnap.resetsAt, now: now }),
                  )
                : null,
              isClaude && claudeStats
                ? h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        background: "var(--dsw-alias-surface-l2, rgba(128,128,128,0.06))",
                        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                      },
                    },
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "8px",
                        },
                      },
                      h(
                        "div",
                        { style: { display: "flex", gap: "8px", alignItems: "baseline" } },
                        h(
                          "span",
                          {
                            style: {
                              fontSize: "17px",
                              fontWeight: 700,
                              color: "var(--dsw-alias-label-primary)",
                            },
                          },
                          formatTokenCount(claudeStats.totalTokens) + " Tokens",
                        ),
                        h(
                          "span",
                          { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } },
                          "(" + (claudeStats.totalTokens || 0).toLocaleString() + " total)",
                        ),
                      ),
                      h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            gap: "10px",
                            fontSize: "11px",
                            color: "var(--dsw-alias-label-secondary)",
                          },
                        },
                        h(
                          "span",
                          null,
                          h(
                            "strong",
                            { style: { color: "var(--dsw-alias-label-primary)" } },
                            (claudeStats.messages || 0).toLocaleString(),
                          ),
                          " messages",
                        ),
                        h(
                          "span",
                          null,
                          h(
                            "strong",
                            { style: { color: "var(--dsw-alias-label-primary)" } },
                            (claudeStats.totalToolCalls || 0).toLocaleString(),
                          ),
                          " tool calls",
                        ),
                      ),
                    ),
                  )
                : null,
              isAntigravity && antigravityQuotas
                ? h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        background: "var(--dsw-alias-surface-l2, rgba(128,128,128,0.06))",
                        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                      },
                    },
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        },
                      },
                      h(
                        "div",
                        { style: { display: "flex", gap: "8px", alignItems: "baseline" } },
                        h(
                          "span",
                          {
                            style: {
                              fontSize: "15px",
                              fontWeight: 700,
                              color: "var(--dsw-alias-label-primary)",
                            },
                          },
                          "Antigravity Multi-Pool Runtime",
                        ),
                        h(
                          "span",
                          {
                            style: {
                              padding: "2px 7px",
                              borderRadius: "10px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background: "rgba(99, 102, 241, 0.15)",
                              color: "#6366f1",
                            },
                          },
                          antigravityQuotas.status || "Active",
                        ),
                      ),
                      h(
                        "div",
                        { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } },
                        "Context: " + (antigravityQuotas.contextWindow || "1M tokens"),
                      ),
                    ),
                  )
                : null,
              h(
                "div",
                { style: { display: "flex", gap: "10px", marginTop: "2px" } },
                h(
                  "button",
                  {
                    onClick: function () {
                      toggleKeys(prov.id);
                    },
                    style: {
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      border:
                        "1px solid " + (isKeysOpen ? "#6366f1" : "var(--dsw-alias-border-l2)"),
                      background: isKeysOpen ? "rgba(99, 102, 241, 0.1)" : "transparent",
                      color: isKeysOpen ? "#6366f1" : "var(--dsw-alias-label-secondary)",
                      cursor: "pointer",
                    },
                  },
                  h(PassGlyph, { size: 13 }),
                  " Configured Keys & Accounts (" +
                    provRows.length +
                    ") " +
                    (isKeysOpen ? "▲" : "▼"),
                ),
              ),
            ),
            isKeysOpen
              ? h(
                  "div",
                  {
                    style: {
                      padding: "16px 20px",
                      background: "var(--dsw-alias-surface-l0, rgba(0,0,0,0.1))",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    },
                  },
                  provRows.length === 0
                    ? h(
                        "div",
                        {
                          style: {
                            padding: "16px",
                            textAlign: "center",
                            fontSize: "12px",
                            color: "var(--dsw-alias-label-tertiary)",
                          },
                        },
                        "No credentials configured. Click '+ Add Key' above.",
                      )
                    : provRows.map(function (row) {
                        var accountName = row.account || "default";
                        var keyId = row.ref + "::" + accountName;
                        var isRev = Boolean(revealed[keyId]);
                        var valDisplay = isRev
                          ? revealed[keyId]
                          : row.inVault
                            ? "••••••••••••••••••••••••••••••••"
                            : "(not set)";
                        return h(
                          "div",
                          {
                            key: keyId,
                            style: {
                              padding: "12px 14px",
                              borderRadius: "8px",
                              border: "1px solid var(--dsw-alias-border-l1)",
                              background: "var(--dsw-alias-surface-l1)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            },
                          },
                          h(
                            "div",
                            {
                              style: {
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              },
                            },
                            h(
                              "div",
                              { style: { display: "flex", gap: "8px", alignItems: "center" } },
                              h("code", { style: { fontSize: "13px", fontWeight: 600 } }, row.ref),
                              h(
                                "span",
                                {
                                  style: {
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    background: "rgba(99, 102, 241, 0.1)",
                                    color: "#6366f1",
                                  },
                                },
                                "@" + accountName,
                              ),
                            ),
                            h(
                              "div",
                              { style: { display: "flex", gap: "6px" } },
                              h(
                                "button",
                                {
                                  onClick: function () {
                                    toggleReveal(keyId);
                                  },
                                  style: {
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    border: "1px solid var(--dsw-alias-border-l2)",
                                    background: "transparent",
                                    cursor: "pointer",
                                  },
                                },
                                isRev ? "Hide" : "Reveal",
                              ),
                              h(
                                "button",
                                {
                                  onClick: function () {
                                    fetch(
                                      VAULT_API +
                                        "/accounts/" +
                                        encodeURIComponent(row.ref) +
                                        "?account=" +
                                        encodeURIComponent(accountName),
                                    )
                                      .then(function (r) {
                                        return r.json();
                                      })
                                      .then(function (res) {
                                        if (res.value) navigator.clipboard.writeText(res.value);
                                      });
                                  },
                                  style: {
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    border: "1px solid var(--dsw-alias-border-l2)",
                                    background: "transparent",
                                    cursor: "pointer",
                                  },
                                },
                                "Copy",
                              ),
                              h(
                                "button",
                                {
                                  onClick: function () {
                                    setEditModal({ ref: row.ref, account: accountName });
                                  },
                                  style: {
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    border: "1px solid var(--dsw-alias-border-l2)",
                                    background: "transparent",
                                    cursor: "pointer",
                                  },
                                },
                                "Edit",
                              ),
                            ),
                          ),
                          h(
                            "code",
                            {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" },
                            },
                            valDisplay,
                          ),
                        );
                      }),
                )
              : null,
          );
        }),
        customVendorGroups.length > 0
          ? h(
              Fragment,
              null,
              h(
                "div",
                {
                  style: {
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--dsw-alias-label-secondary)",
                    marginTop: "4px",
                  },
                },
                "Custom & Multi-Account Providers",
              ),
              customVendorGroups.map(function (group) {
                var availableCount = group.accounts.filter(function (a) {
                  return a.status === "available";
                }).length;
                return h(
                  "div",
                  {
                    key: "vendor::" + group.vendor,
                    style: {
                      borderRadius: "10px",
                      border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.18))",
                      background: "var(--dsw-alias-surface-l0, rgba(255,255,255,0.02))",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    },
                  },
                  h(
                    "div",
                    {
                      style: {
                        padding: "14px 20px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "10px",
                        background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.03))",
                      },
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "10px" } },
                      h(ProviderBrandIcon, { id: group.vendor, size: 20 }),
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "15px",
                            fontWeight: 600,
                            color: "var(--dsw-alias-label-primary)",
                          },
                        },
                        group.label,
                      ),
                      h(
                        "span",
                        {
                          style: {
                            padding: "2px 7px",
                            borderRadius: "10px",
                            fontSize: "10px",
                            fontWeight: 600,
                            background: "rgba(99, 102, 241, 0.12)",
                            color: "var(--dsw-alias-primary, #6366f1)",
                          },
                        },
                        group.accounts.length +
                          (group.accounts.length === 1 ? " account" : " accounts"),
                      ),
                    ),
                    h(
                      "span",
                      { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } },
                      availableCount + " / " + group.accounts.length + " available",
                    ),
                  ),
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        padding: "12px 20px 16px",
                      },
                    },
                    group.accounts.map(function (snap) {
                      return h(
                        "div",
                        {
                          key: snap.provider,
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "12px",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: "1px solid var(--dsw-alias-border-l1)",
                            background: "var(--dsw-alias-surface-l1)",
                          },
                        },
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                              minWidth: "160px",
                            },
                          },
                          h(
                            "code",
                            { style: { fontSize: "12px", fontWeight: 600 } },
                            snap.displayName || snap.provider,
                          ),
                          h(quotaWidgets.QuotaStatusDot, { status: snap.status }),
                          snap.message
                            ? h(
                                "span",
                                {
                                  style: {
                                    fontSize: "10px",
                                    color: "var(--dsw-alias-label-tertiary)",
                                  },
                                },
                                snap.message,
                              )
                            : null,
                        ),
                        h(quotaWidgets.QuotaMeterBar, {
                          remaining: snap.remaining,
                          limit: snap.limit,
                          unit: snap.unit,
                        }),
                        h(quotaWidgets.QuotaResetTimer, { resetsAt: snap.resetsAt, now: now }),
                        h(
                          "button",
                          {
                            onClick: function () {
                              handleProbe(snap.provider);
                            },
                            disabled: probing[snap.provider],
                            style: {
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              border: "1px solid var(--dsw-alias-border-l2)",
                              background: "var(--dsw-alias-surface-l2)",
                              color: "var(--dsw-alias-label-primary)",
                              cursor: "pointer",
                            },
                          },
                          probing[snap.provider] ? "Probing…" : "Probe",
                        ),
                      );
                    }),
                  ),
                );
              }),
            )
          : null,
        editModal
          ? h(EditValueModal, {
              target: editModal,
              onClose: function () {
                setEditModal(null);
              },
              onSaved: load,
            })
          : null,
        addKeyModal
          ? h(AddKeyModal, {
              target: addKeyModal,
              onClose: function () {
                setAddKeyModal(null);
              },
              onSaved: load,
            })
          : null,
        oauthModal
          ? h(OAuthFlowModal, {
              target: oauthModal,
              onClose: function () {
                setOauthModal(null);
              },
              onDone: load,
            })
          : null,
      );
    }

    // 1b. SETTINGS: MODELS SECTION
    /**
     * Renders a section of models with styling and context information.
     *
     * Returns a React `div` element containing styled `span` and `div` elements
     * representing the status and context of the models.
     *
     * Fallbacks to `null` if `antigravityQuotas` is not provided or does not contain
     * the necessary properties.
     */
    function ModelsSection() {
      var addModelModalState = React.useState(null);
      var addModelModal = addModelModalState[0],
        setAddModelModal = addModelModalState[1];
      // Live quota status per provider, so the models catalog carries the
      // same "is this route actually usable right now" signal the Accounts
      // tab shows instead of only ever listing static model metadata (#164).
      var snapshotsState = React.useState([]);
      var snapshots = snapshotsState[0],
        setSnapshots = snapshotsState[1];
      var nowState = React.useState(Date.now());
      var now = nowState[0],
        setNow = nowState[1];
      React.useEffect(function () {
        /** Fetches the live quota snapshots this section's provider cards read their status badge from. */
        var loadSnapshots = function () {
          fetch(QUOTAS_API + "/snapshots")
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              setSnapshots((res && res.snapshots) || []);
            })
            .catch(function () {
              setSnapshots([]);
            });
        };
        loadSnapshots();
        var timer = setInterval(function () {
          setNow(Date.now());
        }, 30000);
        return function () {
          clearInterval(timer);
        };
      }, []);

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "900px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
            },
          },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px 0",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "AI Models Catalog",
            ),
            h(
              "div",
              { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Explore supported AI models by provider, context window capacities, reasoning tags, and custom model endpoints.",
            ),
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            h(
              "button",
              {
                onClick: function () {
                  setAddModelModal({ prov: PROVIDERS_CATALOG[0] });
                },
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "7px",
                  background: "var(--dsw-alias-primary, #6366f1)",
                  color: "#fff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                },
              },
              "+ Add Custom Model",
            ),
          ),
        ),
        PROVIDERS_CATALOG.filter(function (p) {
          return p.models && p.models.length > 0;
        }).map(function (prov) {
          return h(
            "div",
            {
              key: "models::" + prov.id,
              style: {
                borderRadius: "10px",
                border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.18))",
                background: "var(--dsw-alias-surface-l0, rgba(255,255,255,0.02))",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                padding: "16px 20px",
                gap: "12px",
              },
            },
            (function () {
              var activeSnapshots = snapshots.filter(function (s) {
                return prov.probeIds.indexOf(s.provider) !== -1;
              });
              var primarySnap = activeSnapshots[0];
              return h(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  },
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "10px" } },
                  h(ProviderBrandIcon, { id: prov.id, size: 20 }),
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--dsw-alias-label-primary)",
                      },
                    },
                    prov.name,
                  ),
                  h(
                    "span",
                    {
                      style: {
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontSize: "10.5px",
                        background: "rgba(99,102,241,0.12)",
                        color: "#6366f1",
                        fontWeight: 600,
                      },
                    },
                    prov.models.length + " models",
                  ),
                ),
                primarySnap
                  ? h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "12px" } },
                      h(quotaWidgets.QuotaStatusDot, { status: primarySnap.status }),
                      h(quotaWidgets.QuotaMeterBar, {
                        remaining: primarySnap.remaining,
                        limit: primarySnap.limit,
                        unit: primarySnap.unit,
                      }),
                      h(quotaWidgets.QuotaResetTimer, { resetsAt: primarySnap.resetsAt, now: now }),
                    )
                  : null,
              );
            })(),
            h(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                  gap: "10px",
                },
              },
              prov.models.map(function (m) {
                return h(
                  "div",
                  {
                    key: m.id,
                    style: {
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--dsw-alias-border-l1)",
                      background: "var(--dsw-alias-surface-l1)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    },
                  },
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      },
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "6px" } },
                      h(ProviderBrandIcon, { id: prov.id, size: 14 }),
                      h("span", { style: { fontSize: "13px", fontWeight: 600 } }, m.name),
                    ),
                    m.isDefault
                      ? h(
                          "span",
                          {
                            style: {
                              padding: "1px 5px",
                              borderRadius: "3px",
                              fontSize: "9px",
                              fontWeight: 700,
                              background: "#6366f1",
                              color: "#fff",
                            },
                          },
                          "DEFAULT",
                        )
                      : null,
                  ),
                  h(
                    "code",
                    { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } },
                    m.id,
                  ),
                  h(
                    "div",
                    { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "2px" } },
                    h(
                      "span",
                      {
                        style: {
                          padding: "1px 5px",
                          borderRadius: "3px",
                          fontSize: "10px",
                          background: "rgba(128,128,128,0.1)",
                        },
                      },
                      m.context + " ctx",
                    ),
                    (m.tags || []).map(function (tag) {
                      return h(
                        "span",
                        {
                          key: tag,
                          style: {
                            padding: "1px 5px",
                            borderRadius: "3px",
                            fontSize: "10px",
                            background: "rgba(99, 102, 241, 0.1)",
                            color: "#6366f1",
                          },
                        },
                        tag,
                      );
                    }),
                  ),
                );
              }),
            ),
          );
        }),
        addModelModal
          ? h(AddModelModal, {
              target: addModelModal,
              onClose: function () {
                setAddModelModal(null);
              },
              onSaved: function () {},
            })
          : null,
      );
    }

    /**
     * Providers settings section (#237): a single "Providers" settings entry
     * with account/credential management and the model catalog as sub-tabs,
     * replacing the former separate "Accounts" and "Models" top-level
     * sections. AccountsSection and ModelsSection are mounted unchanged —
     * this shell only owns the sub-tab switcher, not their content.
     */
    function ProvidersSection() {
      var subtabState = React.useState("accounts");
      var subtab = subtabState[0],
        setSubtab = subtabState[1];

      var tabs = [
        { key: "accounts", label: "Accounts" },
        { key: "models", label: "Models" },
      ];

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" } },
        h(
          "div",
          {
            style: {
              display: "inline-flex",
              alignSelf: "flex-start",
              gap: "4px",
              background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.05))",
              padding: "3px",
              borderRadius: "8px",
              border: "1px solid var(--dsw-alias-border-l1)",
            },
          },
          tabs.map(function (tab) {
            var isAct = subtab === tab.key;
            return h(
              "button",
              {
                key: tab.key,
                type: "button",
                onClick: function () {
                  setSubtab(tab.key);
                },
                style: {
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: isAct ? "var(--dsw-alias-primary, #6366f1)" : "transparent",
                  color: isAct ? "#fff" : "var(--dsw-alias-label-secondary)",
                  fontSize: "12px",
                  fontWeight: isAct ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 120ms ease",
                },
              },
              tab.label,
            );
          }),
        ),
        subtab === "accounts" ? h(AccountsSection, null) : null,
        subtab === "models" ? h(ModelsSection, null) : null,
      );
    }

    // 1c. SETTINGS: APPS SECTION
    /** Sub-tabs mounted inside AppsSection: local runners, plus the merged Terminals and Containers settings. */
    var APPS_SUBTABS = [
      { id: "runtimes", label: "Runtimes" },
      { id: "terminals", label: "Terminals" },
      { id: "containers", label: "Containers" },
    ];

    /**
     * Renders the Apps settings section with sub-tabs for runtimes, terminals, and containers.
     *
     * @returns {React.ReactElement} The Apps settings section.
     */
    function AppsSection() {
      var state = React.useState({
        integrationsMeta: null,
        loading: true,
      });
      var data = state[0],
        setData = state[1];
      var subtabState = React.useState("runtimes");
      var subtab = subtabState[0],
        setSubtab = subtabState[1];

      React.useEffect(function () {
        fetch(QUOTAS_API + "/integrations")
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setData({ integrationsMeta: res, loading: false });
          })
          .catch(function () {
            setData({ integrationsMeta: null, loading: false });
          });
      }, []);

      var ollamaMeta =
        data.integrationsMeta && data.integrationsMeta.ollama ? data.integrationsMeta.ollama : null;

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "850px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
              gap: "16px",
              flexWrap: "wrap",
            },
          },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px 0",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Developer Apps & Local Runners",
            ),
            h(
              "div",
              { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Manage local inference runtimes (Ollama, vLLM), developer platforms, MCP tools, speech engines, terminal sessions, and sandboxed containers.",
            ),
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: "4px",
                background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.05))",
                padding: "3px",
                borderRadius: "8px",
                border: "1px solid var(--dsw-alias-border-l1)",
              },
            },
            APPS_SUBTABS.map(function (tab) {
              var isAct = subtab === tab.id;
              return h(
                "button",
                {
                  key: tab.id,
                  type: "button",
                  onClick: function () {
                    setSubtab(tab.id);
                  },
                  style: {
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: isAct ? "var(--dsw-alias-primary, #6366f1)" : "transparent",
                    color: isAct ? "#fff" : "var(--dsw-alias-label-secondary)",
                    fontSize: "12px",
                    fontWeight: isAct ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 120ms ease",
                  },
                },
                tab.label,
              );
            }),
          ),
        ),
        // Runtimes Subtab
        subtab === "runtimes"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "20px" } },
              // Ollama Local Runner
              h(
                "div",
                {
                  style: {
                    borderRadius: "10px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "10px" } },
                    h(ProviderBrandIcon, { id: "ollama", size: 22 }),
                    h(
                      "div",
                      null,
                      h(
                        "div",
                        { style: { fontSize: "15px", fontWeight: 600 } },
                        "Ollama Local Engine",
                      ),
                      h(
                        "div",
                        { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                        "Local offline LLM runner on http://127.0.0.1:11434",
                      ),
                    ),
                  ),
                  h(
                    "span",
                    {
                      style: {
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: ollamaMeta
                          ? "rgba(99, 102, 241, 0.15)"
                          : "rgba(128,128,128,0.15)",
                        color: ollamaMeta ? "#6366f1" : "var(--dsw-alias-label-secondary)",
                      },
                    },
                    ollamaMeta ? "ONLINE" : "STANDBY",
                  ),
                ),
                ollamaMeta
                  ? h(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                      h(
                        "div",
                        { style: { fontSize: "12px", fontWeight: 600 } },
                        "Installed Local Models:",
                      ),
                      (ollamaMeta.availableModels || []).map(function (m) {
                        return h(
                          "div",
                          {
                            key: m.name,
                            style: {
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: "5px",
                              background: "var(--dsw-alias-surface-l2)",
                            },
                          },
                          h("span", { style: { fontSize: "12px" } }, m.name),
                          h(
                            "span",
                            {
                              style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" },
                            },
                            m.size ? (m.size / (1024 * 1024 * 1024)).toFixed(1) + " GB" : "",
                          ),
                        );
                      }),
                    )
                  : null,
              ),
              // MCP Tools Runner
              h(
                "div",
                {
                  style: {
                    borderRadius: "10px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  },
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "10px" } },
                  h(ToolsGlyph, { size: 22 }),
                  h(
                    "div",
                    null,
                    h(
                      "div",
                      { style: { fontSize: "15px", fontWeight: 600 } },
                      "Model Context Protocol (MCP) Tools",
                    ),
                    h(
                      "div",
                      { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                      "Dynamic external tool servers and agent execution bridges",
                    ),
                  ),
                ),
                h(
                  "span",
                  {
                    style: {
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "rgba(99, 102, 241, 0.15)",
                      color: "#6366f1",
                    },
                  },
                  "ENABLED",
                ),
              ),
              // Voice & Speech Engine
              h(
                "div",
                {
                  style: {
                    borderRadius: "10px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  },
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "10px" } },
                  h(MicGlyph, { size: 22, style: { color: "#6366f1" } }),
                  h(
                    "div",
                    null,
                    h(
                      "div",
                      { style: { fontSize: "15px", fontWeight: 600 } },
                      "Voice & Audio Synthesis Engine",
                    ),
                    h(
                      "div",
                      { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                      "Neural text-to-speech (Edge TTS, OpenAI, ElevenLabs) and audio controls",
                    ),
                  ),
                ),
                h(
                  "span",
                  {
                    style: {
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "rgba(99, 102, 241, 0.15)",
                      color: "#6366f1",
                    },
                  },
                  "ACTIVE",
                ),
              ),
            )
          : null,
        // Terminals Subtab
        subtab === "terminals" ? h(TmuxSettingsSection) : null,
        // Containers Subtab
        subtab === "containers" ? h(DockerSettingsSection) : null,
      );
    }

    /** Shared labeled settings row (title + description + a control) used by the settings sections below. */
    function renderSettingsRow(title, desc, control) {
      return h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "var(--dsw-alias-surface-l1)",
            border: "1px solid var(--dsw-alias-border-l1)",
          },
        },
        h(
          "div",
          null,
          h("div", { style: { fontSize: "14px", fontWeight: 600 } }, title),
          h(
            "div",
            { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
            desc,
          ),
        ),
        control,
      );
    }

    /** Shared settings-section shell (header + row list + save footer) used by the settings sections below. */
    function renderSettingsSectionShell(title, desc, rows, saved, handleSave, saveLabel) {
      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "800px",
          },
        },
        h(
          "div",
          {
            style: {
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
            },
          },
          h("h2", { style: { margin: "0 0 4px 0", fontSize: "18px", fontWeight: 600 } }, title),
          h(
            "div",
            { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
            desc,
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "16px" } },
          rows.concat([
            h(
              "div",
              { style: { display: "flex", justifyContent: "flex-end", marginTop: "8px" } },
              h(
                "button",
                {
                  onClick: handleSave,
                  style: {
                    padding: "8px 18px",
                    borderRadius: "7px",
                    border: "none",
                    background: "var(--dsw-alias-primary, #6366f1)",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  },
                },
                saved ? "Saved & Applied ✓" : saveLabel,
              ),
            ),
          ]),
        ),
      );
    }

    /** Shared select-control style used by the settings rows below. */
    var SETTINGS_SELECT_STYLE = {
      padding: "6px 12px",
      borderRadius: "6px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-surface-l2)",
      color: "inherit",
    };

    // 2. SETTINGS: TMUX CONFIGURATION
    /**
     * Fetches integration data and updates the state with integration metadata or handles errors.
     * Guarantees that the loading state is updated and integration metadata is set or cleared on failure.
     * Returns: The component renders a div displaying the integration metadata or a loading state.
     */
    function TmuxSettingsSection() {
      var shellState = React.useState("/bin/zsh");
      var shell = shellState[0],
        setShell = shellState[1];
      var historyState = React.useState("10000");
      var history = historyState[0],
        setHistory = historyState[1];
      var mouseState = React.useState(true);
      var mouse = mouseState[0],
        setMouse = mouseState[1];
      var autoContainState = React.useState(true);
      var autoContain = autoContainState[0],
        setAutoContain = autoContainState[1];
      var savedState = React.useState(false);
      var saved = savedState[0],
        setSaved = savedState[1];

      /**
       * Displays and allows the user to manage Developer Apps & Local Runners.
       *
       * This component renders a section with a title and a div with a bottom border.
       * It does not return anything but sets up the UI for the specified section.
       */
      var handleSave = function () {
        setSaved(true);
        setTimeout(function () {
          setSaved(false);
        }, 2500);
      };

      return renderSettingsSectionShell(
        "Tmux Engine Configuration",
        "Configure the in-process tmux multiplexer, default shell, scrollback buffer, and agent containment.",
        [
          renderSettingsRow(
            "Default Shell",
            "Shell executed when launching new tmux terminal sessions",
            h(
              "select",
              {
                value: shell,
                onChange: function (e) {
                  setShell(e.target.value);
                },
                style: SETTINGS_SELECT_STYLE,
              },
              h("option", { value: "/bin/zsh" }, "Zsh (/bin/zsh)"),
              h("option", { value: "/bin/bash" }, "Bash (/bin/bash)"),
              h("option", { value: "/bin/sh" }, "POSIX Shell (/bin/sh)"),
            ),
          ),
          renderSettingsRow(
            "Scrollback History Limit",
            "Maximum line count retained in terminal screen buffer",
            h("input", {
              type: "number",
              value: history,
              onChange: function (e) {
                setHistory(e.target.value);
              },
              style: {
                width: "100px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2)",
                background: "var(--dsw-alias-surface-l2)",
                color: "inherit",
              },
            }),
          ),
          renderSettingsRow(
            "Mouse Mode Support",
            "Enable mouse scrolling and pane focus (set -g mouse on)",
            h("input", {
              type: "checkbox",
              checked: mouse,
              onChange: function (e) {
                setMouse(e.target.checked);
              },
              style: { width: "18px", height: "18px", cursor: "pointer" },
            }),
          ),
          renderSettingsRow(
            "Agent Task Containment",
            "Automatically contain and multiplex background agent CLI subprocesses inside tmux",
            h("input", {
              type: "checkbox",
              checked: autoContain,
              onChange: function (e) {
                setAutoContain(e.target.checked);
              },
              style: { width: "18px", height: "18px", cursor: "pointer" },
            }),
          ),
        ],
        saved,
        handleSave,
        "Save Tmux Configuration",
      );
    }

    // 3. SETTINGS: DOCKER CONFIGURATION
    /**
     * Displays the list of installed local models with their names and sizes.
     *
     * Returns a JSX element representing the section with the models' details.
     */
    function DockerSettingsSection() {
      var imageState = React.useState("node:22-alpine");
      var image = imageState[0],
        setImage = imageState[1];
      var memoryState = React.useState("2GB");
      var memory = memoryState[0],
        setMemory = memoryState[1];
      var networkState = React.useState("bridge");
      var network = networkState[0],
        setNetwork = networkState[1];
      var autoPruneState = React.useState(false);
      var autoPrune = autoPruneState[0],
        setAutoPrune = autoPruneState[1];
      var savedState = React.useState(false);
      var saved = savedState[0],
        setSaved = savedState[1];

      /**
       * Handles the save operation, ensuring the provided data is valid and updating the UI with the result.
       * Returns a message indicating success or failure of the save operation.
       * @returns {string} A message indicating whether the save was successful or not.
       */
      var handleSave = function () {
        setSaved(true);
        setTimeout(function () {
          setSaved(false);
        }, 2500);
      };

      return renderSettingsSectionShell(
        "Docker Sandbox Configuration",
        "Configure default container isolation images, memory quotas, and network sandboxing.",
        [
          renderSettingsRow(
            "Default Sandbox Image",
            "Base container image for agent sandboxed execution",
            h(
              "select",
              {
                value: image,
                onChange: function (e) {
                  setImage(e.target.value);
                },
                style: SETTINGS_SELECT_STYLE,
              },
              h("option", { value: "node:22-alpine" }, "Node.js 22 Alpine (Fast & Lightweight)"),
              h("option", { value: "python:3.11-slim" }, "Python 3.11 Slim (Data & Scripting)"),
              h("option", { value: "ubuntu:22.04" }, "Ubuntu 22.04 LTS (Full Environment)"),
            ),
          ),
          renderSettingsRow(
            "Container Memory Quota",
            "Maximum RAM allocated per sandboxed container",
            h(
              "select",
              {
                value: memory,
                onChange: function (e) {
                  setMemory(e.target.value);
                },
                style: SETTINGS_SELECT_STYLE,
              },
              h("option", { value: "1GB" }, "1 GB"),
              h("option", { value: "2GB" }, "2 GB (Recommended)"),
              h("option", { value: "4GB" }, "4 GB"),
              h("option", { value: "8GB" }, "8 GB"),
            ),
          ),
          renderSettingsRow(
            "Network Sandboxing",
            "Isolation mode for agent container networking",
            h(
              "select",
              {
                value: network,
                onChange: function (e) {
                  setNetwork(e.target.value);
                },
                style: SETTINGS_SELECT_STYLE,
              },
              h("option", { value: "bridge" }, "Bridge (Standard Outbound Access)"),
              h("option", { value: "none" }, "None / Air-Gapped (No Network Access)"),
              h("option", { value: "host" }, "Host Network"),
            ),
          ),
          renderSettingsRow(
            "Auto-Prune Idle Sandboxes",
            "Automatically clean up stopped sandboxes after session completion",
            h("input", {
              type: "checkbox",
              checked: autoPrune,
              onChange: function (e) {
                setAutoPrune(e.target.checked);
              },
              style: { width: "18px", height: "18px", cursor: "pointer" },
            }),
          ),
        ],
        saved,
        handleSave,
        "Save Docker Configuration",
      );
    }

    // 4. SETTINGS: TOOLS SECTION
    /**
     * Renders a settings row with a title, description, and control element.
     *
     * @param {string} title - The title of the settings row.
     * @param {string} desc - The description of the settings row.
     * @param {React.ReactNode} control - The control element to display.
     * @returns {JSX.Element} A div element representing the settings row.
     */
    function ToolsSection() {
      var TOOLS_LIST = [
        {
          id: "read_file",
          name: "Read File",
          cat: "Coding",
          desc: "Read file contents, slices, and text ranges",
          perm: "Auto-Approve",
        },
        {
          id: "write_to_file",
          name: "Write File",
          cat: "Coding",
          desc: "Create new files or overwrite existing files",
          perm: "Prompt",
        },
        {
          id: "replace_file_content",
          name: "Edit Code (Replace)",
          cat: "Coding",
          desc: "Precise contiguous code replacements",
          perm: "Auto-Approve",
        },
        {
          id: "run_command",
          name: "Run Terminal Command",
          cat: "Coding",
          desc: "Execute CLI commands in host/sandbox shell",
          perm: "Prompt",
        },
        {
          id: "search_web",
          name: "Web Search",
          cat: "Research",
          desc: "Query live web results via search engine",
          perm: "Auto-Approve",
        },
        {
          id: "read_url_content",
          name: "Fetch URL Markdown",
          cat: "Research",
          desc: "Extract clean markdown from web documentation",
          perm: "Auto-Approve",
        },
        {
          id: "invoke_subagent",
          name: "Invoke Subagent",
          cat: "Orchestration",
          desc: "Spawn background specialist subagents",
          perm: "Auto-Approve",
        },
        {
          id: "manage_task",
          name: "Manage Tasks",
          cat: "Orchestration",
          desc: "List, status, kill, or send input to tasks",
          perm: "Auto-Approve",
        },
        {
          id: "schedule",
          name: "Schedule / Timers",
          cat: "Orchestration",
          desc: "One-shot timers and recurring cron jobs",
          perm: "Auto-Approve",
        },
        {
          id: "mcp_deepseek_harness",
          name: "MCP DeepSeek Harness",
          cat: "MCP Protocol",
          desc: "Model Context Protocol bridge into dsh runtime",
          perm: "Auto-Approve",
        },
      ];

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "840px",
          },
        },
        h(
          "div",
          {
            style: {
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
            },
          },
          h(
            "h2",
            { style: { margin: "0 0 4px 0", fontSize: "18px", fontWeight: 600 } },
            "Tools & MCP Capabilities",
          ),
          h(
            "div",
            { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
            "Inspect built-in agent coding tools, registered MCP servers, and execution approval policies.",
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "10px" } },
          TOOLS_LIST.map(function (t) {
            return h(
              "div",
              {
                key: t.id,
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: "var(--dsw-alias-surface-l1)",
                  border: "1px solid var(--dsw-alias-border-l1)",
                },
              },
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("strong", { style: { fontSize: "14px" } }, t.name),
                  h(
                    "code",
                    { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } },
                    t.id,
                  ),
                  h(
                    "span",
                    {
                      style: {
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        background: "rgba(99, 102, 241, 0.1)",
                        color: "#6366f1",
                      },
                    },
                    t.cat,
                  ),
                ),
                h(
                  "div",
                  { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                  t.desc,
                ),
              ),
              h(
                "span",
                {
                  style: {
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background:
                      t.perm === "Auto-Approve"
                        ? "rgba(99, 102, 241, 0.15)"
                        : "rgba(128, 128, 128, 0.15)",
                    color:
                      t.perm === "Auto-Approve" ? "#6366f1" : "var(--dsw-alias-label-secondary)",
                  },
                },
                t.perm,
              ),
            );
          }),
        ),
      );
    }

    // 5. SETTINGS: LOOPS SECTION
    /**
     * Renders a section of terminal settings options including scrollback history limit and mouse mode support.
     * Displays input fields for users to set the scrollback history limit and toggle mouse mode support.
     *
     * @returns {JSX.Element} A JSX element representing the settings section.
     */
    function LoopsSection() {
      var LOOPS_LIST = [
        {
          id: "darkfactory-orchestrator",
          name: "DarkFactory Autonomous Work Loop",
          interval: "Continuous / Baton Handoff",
          status: "Active",
          desc: "Multi-provider quota recovery & session watchdog",
        },
        {
          id: "metrics-telemetry",
          name: "Metrics & Quota Sync",
          interval: "Every 5m",
          status: "Active",
          desc: "Refreshes token counters & sliding window utilization",
        },
        {
          id: "sandbox-watchdog",
          name: "Docker Container Prune Loop",
          interval: "Hourly (0 * * * *)",
          status: "Idle",
          desc: "Cleans up unattached stopped sandbox instances",
        },
      ];

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "840px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
            },
          },
          h(
            "div",
            null,
            h(
              "h2",
              { style: { margin: "0 0 4px 0", fontSize: "18px", fontWeight: 600 } },
              "Autonomous Work Loops",
            ),
            h(
              "div",
              { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Manage autonomous execution loops, recurring cron jobs, and background workers.",
            ),
          ),
          h(
            "button",
            {
              onClick: function () {
                alert(
                  "Use `/loop <interval> <prompt>` or the schedule tool to add new autonomous loops.",
                );
              },
              style: {
                padding: "7px 14px",
                borderRadius: "7px",
                border: "none",
                background: "var(--dsw-alias-primary, #6366f1)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
              },
            },
            "+ Schedule Loop",
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          LOOPS_LIST.map(function (loop) {
            return h(
              "div",
              {
                key: loop.id,
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderRadius: "8px",
                  background: "var(--dsw-alias-surface-l1)",
                  border: "1px solid var(--dsw-alias-border-l1)",
                },
              },
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "4px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("strong", { style: { fontSize: "14px" } }, loop.name),
                  h(
                    "span",
                    {
                      style: {
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "#6366f1",
                        fontWeight: 600,
                      },
                    },
                    loop.status,
                  ),
                ),
                h(
                  "div",
                  { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                  loop.desc,
                ),
                h(
                  "div",
                  { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } },
                  "Interval: " + loop.interval,
                ),
              ),
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                h(
                  "button",
                  {
                    style: {
                      padding: "5px 10px",
                      borderRadius: "5px",
                      border: "1px solid var(--dsw-alias-border-l2)",
                      background: "transparent",
                      fontSize: "11px",
                      cursor: "pointer",
                    },
                  },
                  "Trigger Now",
                ),
                h(
                  "button",
                  {
                    style: {
                      padding: "5px 10px",
                      borderRadius: "5px",
                      border: "1px solid var(--dsw-alias-border-l2)",
                      background: "transparent",
                      fontSize: "11px",
                      cursor: "pointer",
                    },
                  },
                  "Pause",
                ),
              ),
            );
          }),
        ),
      );
    }

    // 6. DOCKED BOTTOM TERMINAL PANEL WITH TABS
    /** BottomTerminalPanel implementation. */
    function BottomTerminalPanel(props) {
      ensureTreeStyles();
      var onClose = props.onClose;
      var initialSession = props.initialSession || "0";
      var initialContainerId = props.initialContainerId || null;
      var state = React.useState({ sessions: [], loading: true, error: null });
      var data = state[0],
        setData = state[1];
      var selectedSessionState = React.useState(initialContainerId ? null : initialSession);
      var selectedSession = selectedSessionState[0],
        setSelectedSession = selectedSessionState[1];

      var windowsState = React.useState([]);
      var windows = windowsState[0],
        setWindows = windowsState[1];

      var bufferState = React.useState("Connecting to tmux interactive runner…");
      var buffer = bufferState[0],
        setBuffer = bufferState[1];

      var cmdState = React.useState("");
      var cmd = cmdState[0],
        setCmd = cmdState[1];

      var isFocusedState = React.useState(true);
      var isFocused = isFocusedState[0],
        setIsFocused = isFocusedState[1];

      var newModalState = React.useState(false);
      var newModal = newModalState[0],
        setNewModal = newModalState[1];

      var heightState = React.useState(290);
      var height = heightState[0],
        setHeight = heightState[1];
      var isMaximizedState = React.useState(false);
      var isMaximized = isMaximizedState[0],
        setIsMaximized = isMaximizedState[1];

      // Tabs closed from this panel: hidden from the strip, process/container
      // keeps running. Filtered at render time only, so a poll that re-fetches
      // the live list never resurrects a dismissed one, and destroying the
      // underlying session/container remains the separate, explicit
      // "Kill"/"Stop" action -- see .agents/rules/destructive-actions-are-explicit-and-audited.md.
      var dismissedSessionIdsState = React.useState(function () {
        return new Set();
      });
      var dismissedSessionIds = dismissedSessionIdsState[0],
        setDismissedSessionIds = dismissedSessionIdsState[1];
      var dismissedContainerIdsState = React.useState(function () {
        return new Set();
      });
      var dismissedContainerIds = dismissedContainerIdsState[0],
        setDismissedContainerIds = dismissedContainerIdsState[1];

      // Container state
      var containersState = React.useState([]);
      var containers = containersState[0],
        setContainers = containersState[1];
      var selectedContainerState = React.useState(initialContainerId);
      var selectedContainer = selectedContainerState[0],
        setSelectedContainer = selectedContainerState[1];
      var containerLogsState = React.useState("Loading container logs…");
      var containerLogs = containerLogsState[0],
        setContainerLogs = containerLogsState[1];

      // A terminal/container tab this panel holds has been committed to
      // another surface (main area or secondary sidebar): drop it from the
      // panel's lists. Removal is commit-driven — a move request no
      // destination accepted leaves the panel's copy untouched.
      React.useEffect(function () {
        return tabMove.onForeignCommit("bottom", function (detail) {
          var committedId = detail && detail.id;
          if (!committedId) return;
          setData(function (prev) {
            return Object.assign({}, prev, {
              sessions: prev.sessions.filter(function (s) {
                return s.name !== committedId;
              }),
            });
          });
          setContainers(function (prev) {
            return prev.filter(function (c) {
              return c.id !== committedId;
            });
          });
        });
      }, []);

      // Destination-side: a move to this panel was requested. Accept it only
      // when this surface can host the tab's type (takeOwnership checks
      // surfaceHostsTab, refusing a chat tab rather than swallowing it --
      // #122). sessions/containers are backend-polled and already
      // deduplicated against the main area's window.__dsh_top_tab_ids__ map,
      // so accepting here only needs to fire the commit for the source to
      // drop its copy; the panel's own poll then renders the real session or
      // container once it is no longer excluded by that map.
      React.useEffect(function () {
        return tabMove.onMoveRequested("bottom", function (tab) {
          tabMove.takeOwnership("bottom", tab);
        });
      }, []);
      // activeView: "chat" | "terminal" | "container"
      var activeViewState = React.useState(
        props.initialView ||
          (initialContainerId ? "container" : initialSession ? "terminal" : "terminal"),
      );
      var activeView = activeViewState[0],
        setActiveView = activeViewState[1];
      var panelPlusMenuState = React.useState(false);
      var panelPlusMenuOpen = panelPlusMenuState[0],
        setPanelPlusMenuOpen = panelPlusMenuState[1];
      var isCollapsedState = React.useState(false);
      var isCollapsed = isCollapsedState[0],
        setIsCollapsed = isCollapsedState[1];
      var tabActionsBtnRef = React.useRef(null);
      var tabActionsOpenState = React.useState(false);
      var tabActionsOpen = tabActionsOpenState[0],
        setTabActionsOpen = tabActionsOpenState[1];

      var terminalContainerRef = React.useRef(null);
      var terminalPreRef = React.useRef(null);

      // Drag to resize handler
      /**
       * Initiates the resize operation for a UI element.
       *
       * The caller must ensure that the element being resized is a valid UI component.
       * On failure, the function does not return anything and the resize operation is not initiated.
       */
      var handleResizeStart = function (e) {
        e.preventDefault();
        var startY = e.clientY;
        var startHeight = height;
        /**
         * Displays a section header for tools and MCP capabilities, followed by a description of the features.
         *
         * This section header is used to guide the user to inspect built-in agent coding tools, registered MCP servers,
         * and execution approval policies.
         */
        var handleMove = function (moveEvent) {
          var delta = startY - moveEvent.clientY;
          var newHeight = Math.max(160, Math.min(window.innerHeight * 0.88, startHeight + delta));
          setHeight(newHeight);
          setIsMaximized(false);
        };
        /**
         * Handles the "Up" action, moving the selected tool up in the list.
         * Moves the selected tool to the position immediately above the current one.
         * Throws an error if no tool is selected or if the tool is already at the top.
         */
        var handleUp = function () {
          document.removeEventListener("pointermove", handleMove);
          document.removeEventListener("pointerup", handleUp);
        };
        document.addEventListener("pointermove", handleMove);
        document.addEventListener("pointerup", handleUp);
      };

      var loadSessions = React.useCallback(
        function () {
          fetch(QUOTAS_API + "/tmux/sessions")
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              var list = res.sessions || [];
              if (list.length === 0) {
                fetch(QUOTAS_API + "/tmux/sessions/new", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name: selectedSession || "0" }),
                }).then(function () {
                  fetch(QUOTAS_API + "/tmux/sessions")
                    .then(function (r2) {
                      return r2.json();
                    })
                    .then(function (res2) {
                      var l2 = res2.sessions || [];
                      setData({ sessions: l2, loading: false, error: null });
                      if (l2.length > 0) setSelectedSession(l2[0].name);
                    });
                });
                return;
              }
              setData({ sessions: list, loading: false, error: null });
              if (
                !list.some(function (s) {
                  return s.name === selectedSession;
                })
              ) {
                setSelectedSession(list[0].name);
              }
            });
        },
        [selectedSession],
      );

      var loadWindows = React.useCallback(function (sessName) {
        if (!sessName) return;
        fetch(QUOTAS_API + "/tmux/sessions/windows?name=" + encodeURIComponent(sessName))
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setWindows(res.windows || []);
          });
      }, []);

      var loadBuffer = React.useCallback(function (sessName) {
        if (!sessName) return;
        fetch(QUOTAS_API + "/tmux/sessions/capture?ansi=1&name=" + encodeURIComponent(sessName))
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setBuffer(res.buffer || "(empty session)");
          });
      }, []);

      React.useEffect(
        function () {
          loadSessions();
        },
        [loadSessions],
      );
      React.useEffect(
        function () {
          loadWindows(selectedSession);
          loadBuffer(selectedSession);
        },
        [selectedSession, loadWindows, loadBuffer],
      );

      // High-frequency live buffer streaming (every 600ms)
      React.useEffect(
        function () {
          var interval = setInterval(function () {
            loadBuffer(selectedSession);
          }, 600);
          return function () {
            clearInterval(interval);
          };
        },
        [selectedSession, loadBuffer],
      );

      // Auto-scroll to bottom on buffer update
      React.useEffect(
        function () {
          if (terminalPreRef.current) {
            terminalPreRef.current.scrollTop = terminalPreRef.current.scrollHeight;
          }
        },
        [buffer, containerLogs],
      );

      // Container data loading
      var loadContainers = React.useCallback(function () {
        fetch(QUOTAS_API + "/docker/containers")
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setContainers(res.containers || []);
          })
          .catch(function () {});
      }, []);

      var loadContainerLogs = React.useCallback(function (cId) {
        if (!cId) return;
        fetch(QUOTAS_API + "/docker/containers/logs?id=" + encodeURIComponent(cId))
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setContainerLogs(res.logs || "(no logs)");
          });
      }, []);

      React.useEffect(
        function () {
          /**
           * Displays a button to add new autonomous loops and alerts the user on click.
           *
           * On failure, an alert is shown with instructions on how to add new autonomous loops.
           */
          var onOpenTerm = function (e) {
            var sess = e && e.detail && e.detail.session ? e.detail.session : "0";
            setActiveView("terminal");
            setSelectedSession(sess);
            setSelectedContainer(null);
            setIsCollapsed(false);
            loadBuffer(sess);
            loadWindows(sess);
          };
          /**
           * Displays a button to alert users about scheduling loops and opens an alert with instructions.
           *
           * On failure or no action, the alert is shown with instructions on how to add new autonomous loops.
           */
          var onOpenCont = function (e) {
            var id = e && e.detail && e.detail.id ? e.detail.id : null;
            setActiveView("container");
            setSelectedContainer(id);
            setSelectedSession(null);
            setIsCollapsed(false);
            if (id) loadContainerLogs(id);
          };
          window.addEventListener("dsh:open-terminal", onOpenTerm);
          window.addEventListener("dsh:open-container", onOpenCont);
          return function () {
            window.removeEventListener("dsh:open-terminal", onOpenTerm);
            window.removeEventListener("dsh:open-container", onOpenCont);
          };
        },
        [loadBuffer, loadWindows, loadContainerLogs],
      );

      React.useEffect(
        function () {
          loadContainers();
          var t = setInterval(loadContainers, 5000);
          return function () {
            clearInterval(t);
          };
        },
        [loadContainers],
      );
      React.useEffect(
        function () {
          if (activeView === "container" && selectedContainer) loadContainerLogs(selectedContainer);
        },
        [activeView, selectedContainer, loadContainerLogs],
      );
      // Live container log streaming (every 2s)
      React.useEffect(
        function () {
          if (activeView !== "container" || !selectedContainer) return;
          var interval = setInterval(function () {
            loadContainerLogs(selectedContainer);
          }, 2000);
          return function () {
            clearInterval(interval);
          };
        },
        [activeView, selectedContainer, loadContainerLogs],
      );

      var /** handleContainerAction implementation. */
        handleContainerAction = function (cId, action) {
          fetch(QUOTAS_API + "/docker/containers/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: cId, action: action }),
          }).then(function () {
            loadContainers();
          });
        };

      /**
       * Displays a terminal tab with status, description, and interval.
       *
       * This function returns a React element representing the terminal tab.
       *
       * Fails if the `loop` object does not contain `status`, `desc`, or `interval`.
       */
      var selectTerminalTab = function (name) {
        setActiveView("terminal");
        setSelectedSession(name);
        setSelectedContainer(null);
        setIsCollapsed(false);
      };

      /**
       * Displays the interval and provides a button to trigger the action immediately.
       *
       * This function returns the JSX elements for the interval display and the "Trigger Now" button.
       *
       * Failing to provide valid JSX properties will result in incorrect rendering.
       */
      var selectContainerTab = function (c) {
        setActiveView("container");
        setSelectedContainer(c.id);
        setSelectedSession(null);
        setIsCollapsed(false);
      };

      // Send key actions
      /**
       * Adjusts the state based on the container's width and observes changes to the container's width.
       * Guarantees that the container's narrow state is updated if its width is less than 420 pixels.
       * Dispatches a "dsh:tab-moved-to-right" event if the container width conditions are met for moving.
       * Fails silently if the width conditions are not met or if the ResizeObserver is disconnected.
       */
      var sendKey = function (key) {
        fetch(QUOTAS_API + "/tmux/sessions/send-keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: selectedSession, keys: key, isLiteral: false }),
        }).then(function () {
          setTimeout(function () {
            loadBuffer(selectedSession);
          }, 40);
        });
      };

      /**
       * Sends a literal event to the terminal panel.
       *
       * Emits a "literal" event with the given text, triggering any event handlers.
       *
       * @param {string} text - The text to send to the terminal panel.
       */
      var sendLiteral = function (text, pressEnter) {
        fetch(QUOTAS_API + "/tmux/sessions/send-keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: selectedSession,
            keys: text,
            isLiteral: true,
            pressEnter: Boolean(pressEnter),
          }),
        }).then(function () {
          setTimeout(function () {
            loadBuffer(selectedSession);
          }, 60);
        });
      };

      /**
       * Handles the execution of a command in the terminal panel.
       *
       * Guarantees that the command is executed and updates the buffer state
       * with the result or error message. If the command fails, the error is
       * set in the buffer state.
       *
       * @param {string} cmd - The command to execute.
       * @returns {void}
       */
      var handleExecuteCommand = function (e) {
        if (e) e.preventDefault();
        if (!cmd.trim()) return;
        sendLiteral(cmd, true);
        setCmd("");
      };

      /**
       * Handles keydown events to manage session and window focus.
       *
       * Guarantees: Updates the selected session or closes the session if 'Esc' is pressed.
       * Returns: None.
       * Fails: Sets `isFocused` to false if the event is not handled.
       */
      var handleKeyDown = function (e) {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

        if (e.key === "Enter") {
          sendKey("Enter");
          e.preventDefault();
        } else if (e.key === "Backspace") {
          sendKey("BSpace");
          e.preventDefault();
        } else if (e.key === "Tab") {
          sendKey("Tab");
          e.preventDefault();
        } else if (e.key === "ArrowUp") {
          sendKey("Up");
          e.preventDefault();
        } else if (e.key === "ArrowDown") {
          sendKey("Down");
          e.preventDefault();
        } else if (e.key === "ArrowLeft") {
          sendKey("Left");
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          sendKey("Right");
          e.preventDefault();
        } else if (e.key === "Escape") {
          sendKey("Escape");
          e.preventDefault();
        } else if (e.ctrlKey) {
          if (e.key === "c" || e.key === "C") {
            sendKey("C-c");
            e.preventDefault();
          } else if (e.key === "d" || e.key === "D") {
            sendKey("C-d");
            e.preventDefault();
          } else if (e.key === "l" || e.key === "L") {
            sendKey("C-l");
            e.preventDefault();
          } else if (e.key === "z" || e.key === "Z") {
            sendKey("C-z");
            e.preventDefault();
          }
        } else if (e.key.length === 1 && !e.metaKey && !e.altKey) {
          sendLiteral(e.key, false);
          e.preventDefault();
        }
      };

      /**
       * Handles the selection of a window, updating the active view state accordingly.
       *
       * Guarantees: Sets the `activeView` state to the selected window type.
       * Returns: None.
       * Fails: If the selected window type is not recognized, the state remains unchanged.
       */
      var handleSelectWindow = function (idx) {
        fetch(QUOTAS_API + "/tmux/sessions/select-window", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: selectedSession, index: idx }),
        }).then(function () {
          loadWindows(selectedSession);
          loadBuffer(selectedSession);
        });
      };

      var /** handleNewWindow implementation. */
        handleNewWindow = function () {
          var winName = prompt("New Window Name:", "sh");
          if (!winName) return;
          fetch(QUOTAS_API + "/tmux/sessions/new-window", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: selectedSession, windowName: winName }),
          }).then(function () {
            loadWindows(selectedSession);
            loadBuffer(selectedSession);
          });
        };

      var /** handleKill implementation. */
        handleKill = function (name) {
          if (!confirm("Kill tmux session '" + name + "'?")) return;
          fetch(QUOTAS_API + "/tmux/sessions/kill", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: name }),
          }).then(function () {
            loadSessions();
          });
        };

      var sidebarRightState = React.useState(260);
      var sidebarRight = sidebarRightState[0],
        setSidebarRight = sidebarRightState[1];
      var detailsWidthState = React.useState(0);
      var detailsWidth = detailsWidthState[0],
        setDetailsWidth = detailsWidthState[1];

      React.useEffect(function () {
        /**
         * Updates the offset height of a pane based on the move event.
         * Guarantees that the new height is between 160 and 80% of the window's inner height.
         * Throws an error if the move event results in an invalid height.
         */
        var updateOffsets = function () {
          var centerEl = document.querySelector('[class*="centerCol"]');
          if (centerEl) {
            var cRect = centerEl.getBoundingClientRect();
            if (cRect.width > 0) {
              setSidebarRight(cRect.left);
              setDetailsWidth(window.innerWidth - cRect.right);
              return;
            }
          }
          var sidebarEl = document.querySelector('[class*="sidebarCol"]');
          if (sidebarEl) {
            var sRect = sidebarEl.getBoundingClientRect();
            if (sRect.right > 0) setSidebarRight(sRect.right);
          }
          var detailsEl = document.querySelector('[class*="detailsCol"]');
          if (detailsEl) {
            var dRect = detailsEl.getBoundingClientRect();
            var dWidth = window.innerWidth - dRect.left;
            if (dWidth >= 0 && dRect.width > 0) setDetailsWidth(dWidth);
            else setDetailsWidth(0);
          }
        };

        updateOffsets();
        var timer = setInterval(updateOffsets, 200);
        window.addEventListener("resize", updateOffsets);
        return function () {
          clearInterval(timer);
          window.removeEventListener("resize", updateOffsets);
        };
      }, []);

      var currentHeight = isCollapsed ? "38px" : isMaximized ? "84vh" : height + "px";

      // Broadcast panel geometry for top view occupants
      React.useEffect(
        function () {
          if (typeof window !== "undefined") {
            window.__dsh_panel_collapsed__ = isCollapsed;
            window.__dsh_panel_height__ = currentHeight;
            window.dispatchEvent(
              new CustomEvent("dsh:panel-geometry-changed", {
                detail: { collapsed: isCollapsed, height: currentHeight },
              }),
            );
          }
        },
        [isCollapsed, currentHeight],
      );

      // Push chat messages up without expanding centerCol layout bounds
      React.useEffect(
        function () {
          var centerCol = document.querySelector('[class*="centerCol"]');
          if (centerCol) {
            centerCol.style.paddingBottom = isCollapsed ? "38px" : currentHeight;
            centerCol.style.marginBottom = "0px";
            centerCol.style.transition = "padding-bottom 120ms ease";
          }
          return function () {
            var col = document.querySelector('[class*="centerCol"]');
            if (col) {
              col.style.paddingBottom = "0px";
              col.style.marginBottom = "0px";
            }
          };
        },
        [currentHeight, isCollapsed],
      );

      return h(
        "div",
        {
          ref: terminalContainerRef,
          tabIndex: 0,
          onKeyDown: handleKeyDown,
          onFocus: function () {
            setIsFocused(true);
          },
          onBlur: function () {
            setIsFocused(false);
          },
          style: {
            position: "fixed",
            bottom: 0,
            left: sidebarRight + "px",
            right: detailsWidth + "px",
            height: currentHeight,
            zIndex: 9000,
            background: "var(--dsw-alias-bg-layer-0, #000000)",
            borderTop: "1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.15))",
            borderLeft: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.4)",
            outline: "none",
            transition: isMaximized ? "height 150ms cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            fontFamily:
              "var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
          },
        },
        // Top Resize Drag Handle (visible when expanded)
        !isCollapsed && activeView !== "chat"
          ? h(
              "div",
              {
                onPointerDown: handleResizeStart,
                style: {
                  position: "absolute",
                  top: "-4px",
                  left: 0,
                  right: 0,
                  height: "8px",
                  cursor: "row-resize",
                  zIndex: 100000,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                },
              },
              h("div", {
                style: {
                  width: "36px",
                  height: "3px",
                  borderRadius: "2px",
                  background: "var(--dsw-alias-border-l2, rgba(255,255,255,0.2))",
                  opacity: 0.7,
                  transition: "background 150ms, opacity 150ms",
                },
              }),
            )
          : null,
        // Header Tab Bar
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              height: "38px",
              background: "var(--dsw-alias-bg-layer-0, #000000)",
              borderBottom:
                activeView === "chat" || isCollapsed
                  ? "none"
                  : "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
              padding: "0 8px 0 10px",
              userSelect: "none",
            },
          },
          // Unified Tabs Container (matching TopConversationTabBar)
          h(
            "div",
            {
              className: "dsh-top-tab-bar",
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.04))",
                padding: "2px 4px",
                borderRadius: "8px",
                border: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
                userSelect: "none",
                maxWidth: "calc(100% - 90px)",
                overflowX: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              },
              onDragOver: function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              },
              onDrop: function (e) {
                e.preventDefault();
                setIsCollapsed(false);
                try {
                  var raw = e.dataTransfer.getData("text/dsh-tab");
                  if (raw) {
                    var tabData = JSON.parse(raw);
                    // Ownership moves only once the destination commits; the
                    // sending surface drops its copy on the commit event.
                    tabMove.requestMove("bottom", tabData);
                    if (tabData.type === "terminal") selectTerminalTab(tabData.id);
                    else if (tabData.type === "container") {
                      setSelectedContainer(tabData.id);
                      setActiveView("container");
                    }
                  }
                } catch (err) {}
              },
            },
            // 0. Conversation Tab (rendered ONLY IF explicitly moved to bottom panel)
            (function () {
              if (activeView !== "chat") return null;
              return h(
                "div",
                {
                  key: "tab-conversation",
                  draggable: true,
                  onDragStart: function (e) {
                    e.dataTransfer.setData(
                      "text/dsh-tab",
                      JSON.stringify({
                        id: "chat-main",
                        type: "chat",
                        title: "Conversation",
                        from: "bottom",
                      }),
                    );
                  },
                  onClick: function () {
                    setActiveView("chat");
                    setSelectedSession(null);
                    setSelectedContainer(null);
                    setIsCollapsed(false);
                  },
                  onContextMenu: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    tabMove.requestMove("top", {
                      id: "chat-main",
                      type: "chat",
                      title: "Conversation",
                    });
                  },
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 8px",
                    borderRadius: "5px",
                    background: "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.18))",
                    border: "1px solid var(--dsw-alias-primary, #6366f1)",
                    color: "var(--dsw-alias-label-primary, #fff)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 120ms ease",
                    whiteSpace: "nowrap",
                  },
                },
                h(ChatGlyph, { size: 12 }),
                h("span", null, "Conversation"),
                h(
                  "button",
                  {
                    type: "button",
                    title: "Restore to Top Tab Bar",
                    onClick: function (e) {
                      e.stopPropagation();
                      tabMove.requestMove("top", {
                        id: "chat-main",
                        type: "chat",
                        title: "Conversation",
                      });
                    },
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "14px",
                      height: "14px",
                      marginLeft: "2px",
                      border: "none",
                      borderRadius: "3px",
                      background: "transparent",
                      color: "inherit",
                      opacity: 0.6,
                      cursor: "pointer",
                      fontSize: "12px",
                    },
                  },
                  "×",
                ),
              );
            })(),
            // 1. Terminal Tabs (filtered against Top Tab Bar for deduplication)
            (function () {
              var topMap =
                typeof window !== "undefined" && window.__dsh_top_tab_ids__
                  ? window.__dsh_top_tab_ids__
                  : {};
              var visibleSessions = data.sessions.filter(function (s) {
                return (
                  !topMap[s.name] && !topMap["term-" + s.name] && !dismissedSessionIds.has(s.name)
                );
              });
              return visibleSessions.map(function (s) {
                var isSel = activeView === "terminal" && s.name === selectedSession;
                return h(
                  "div",
                  {
                    key: "term-" + s.name,
                    draggable: true,
                    onDragStart: function (e) {
                      e.dataTransfer.setData(
                        "text/dsh-tab",
                        JSON.stringify({
                          id: s.name,
                          type: "terminal",
                          title: s.name,
                          session: s.name,
                          from: "bottom",
                        }),
                      );
                    },
                    onClick: function () {
                      selectTerminalTab(s.name);
                    },
                    onContextMenu: function (e) {
                      e.preventDefault();
                      e.stopPropagation();
                      setTabActionsOpen(true);
                    },
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px",
                      borderRadius: "5px",
                      background: isSel
                        ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.18))"
                        : "transparent",
                      border: isSel
                        ? "1px solid var(--dsw-alias-primary, #6366f1)"
                        : "1px solid transparent",
                      color: isSel
                        ? "var(--dsw-alias-label-primary, #fff)"
                        : "var(--dsw-alias-label-secondary, #8b949e)",
                      fontSize: "12px",
                      fontWeight: isSel ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 120ms ease",
                      whiteSpace: "nowrap",
                    },
                  },
                  h(TerminalsGlyph, { size: 12 }),
                  h("span", null, s.name),
                  h(
                    "span",
                    { style: { fontSize: "10px", opacity: 0.5, marginLeft: "1px" } },
                    s.windows + "w",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      title:
                        "Close (session keeps running -- use Kill in the tab's context menu to end it)",
                      onClick: function (e) {
                        e.stopPropagation();
                        setDismissedSessionIds(function (prev) {
                          var next = new Set(prev);
                          next.add(s.name);
                          return next;
                        });
                        if (selectedSession === s.name) {
                          var remaining = data.sessions.filter(function (x) {
                            return x.name !== s.name && !dismissedSessionIds.has(x.name);
                          });
                          setSelectedSession(remaining.length > 0 ? remaining[0].name : null);
                        }
                      },
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "14px",
                        height: "14px",
                        marginLeft: "2px",
                        padding: 0,
                        border: "none",
                        borderRadius: "3px",
                        background: "transparent",
                        color: "inherit",
                        opacity: 0.6,
                        cursor: "pointer",
                        fontSize: "12px",
                      },
                      onMouseEnter: function (e) {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "#f85149";
                      },
                      onMouseLeave: function (e) {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.color = "inherit";
                      },
                    },
                    "×",
                  ),
                );
              });
            })(),
            // 2. Container Tabs (filtered against Top Tab Bar for deduplication)
            (function () {
              var topMap =
                typeof window !== "undefined" && window.__dsh_top_tab_ids__
                  ? window.__dsh_top_tab_ids__
                  : {};
              var visibleContainers = containers.filter(function (c) {
                return (
                  !topMap[c.id] &&
                  !topMap["container-sandboxes"] &&
                  !dismissedContainerIds.has(c.id)
                );
              });
              return visibleContainers.map(function (c) {
                var isSel = activeView === "container" && selectedContainer === c.id;
                return h(
                  "div",
                  {
                    key: "cont-" + c.id,
                    draggable: true,
                    onDragStart: function (e) {
                      e.dataTransfer.setData(
                        "text/dsh-tab",
                        JSON.stringify({
                          id: c.id,
                          type: "container",
                          title: c.name || c.id.substring(0, 12),
                          from: "bottom",
                        }),
                      );
                    },
                    onClick: function () {
                      selectContainerTab(c);
                    },
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px",
                      borderRadius: "5px",
                      background: isSel
                        ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.18))"
                        : "transparent",
                      border: isSel
                        ? "1px solid var(--dsw-alias-primary, #6366f1)"
                        : "1px solid transparent",
                      color: isSel
                        ? "var(--dsw-alias-label-primary, #fff)"
                        : "var(--dsw-alias-label-secondary, #8b949e)",
                      fontSize: "12px",
                      fontWeight: isSel ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 120ms ease",
                      whiteSpace: "nowrap",
                    },
                  },
                  h(ContainersGlyph, { size: 12 }),
                  h("span", null, c.name || c.id.substring(0, 12)),
                  h("span", {
                    style: {
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: c.isRunning ? "#3fb950" : "#888",
                      marginLeft: "2px",
                    },
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      title:
                        "Close (container keeps running -- use Stop in the container menu to end it)",
                      onClick: function (e) {
                        e.stopPropagation();
                        setDismissedContainerIds(function (prev) {
                          var next = new Set(prev);
                          next.add(c.id);
                          return next;
                        });
                        if (selectedContainer === c.id) {
                          setActiveView("terminal");
                        }
                      },
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "14px",
                        height: "14px",
                        marginLeft: "2px",
                        padding: 0,
                        border: "none",
                        borderRadius: "3px",
                        background: "transparent",
                        color: "inherit",
                        opacity: 0.6,
                        cursor: "pointer",
                        fontSize: "12px",
                      },
                      onMouseEnter: function (e) {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "#f85149";
                      },
                      onMouseLeave: function (e) {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.color = "inherit";
                      },
                    },
                    "×",
                  ),
                );
              });
            })(),
            // 3. Plus Button with Dropdown Context Menu
            (function () {
              var panelPlusBtnRef = React.useRef(null);
              return h(
                "div",
                { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
                h(
                  "button",
                  {
                    ref: panelPlusBtnRef,
                    type: "button",
                    title: "New Session / Terminal / Container",
                    onClick: function (e) {
                      e.stopPropagation();
                      setPanelPlusMenuOpen(function (v) {
                        return !v;
                      });
                    },
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "22px",
                      height: "22px",
                      borderRadius: "4px",
                      border: "none",
                      background: "transparent",
                      color: "var(--dsw-alias-label-secondary)",
                      cursor: "pointer",
                    },
                    onMouseEnter: function (e) {
                      e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
                    },
                    onMouseLeave: function (e) {
                      e.currentTarget.style.background = "transparent";
                    },
                  },
                  h(PlusGlyph, { size: 13 }),
                ),
                h(SelectDropdownMenu, {
                  open: panelPlusMenuOpen,
                  anchorRef: panelPlusBtnRef,
                  onClose: function () {
                    setPanelPlusMenuOpen(false);
                  },
                  items: [
                    { id: "chat", label: "Conversation", icon: h(ChatGlyph, { size: 13 }) },
                    { id: "terminal", label: "Terminal", icon: h(TerminalsGlyph, { size: 13 }) },
                    { id: "container", label: "Container", icon: h(ContainersGlyph, { size: 13 }) },
                  ],
                  onSelect: function (actionId) {
                    setPanelPlusMenuOpen(false);
                    setIsCollapsed(false);
                    if (actionId === "chat") {
                      setActiveView("chat");
                      var startBtn = document.querySelector(
                        '[class*="brand"], [class*="newSession"]',
                      );
                      if (startBtn) startBtn.click();
                      window.dispatchEvent(new CustomEvent("dsh:new-session"));
                    } else if (actionId === "terminal") {
                      setNewModal(true);
                    } else if (actionId === "container") {
                      window.dispatchEvent(
                        new CustomEvent("dsh:open-container", { detail: { id: null } }),
                      );
                    }
                  },
                }),
              );
            })(),
          ),
          // Right Controls Bar (3-dots specialized actions + collapse/expand toggle)
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "4px" } },
            windows.length > 1
              ? h(
                  "div",
                  {
                    className: "dsh-term-tabs",
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      marginRight: "6px",
                      overflowX: "auto",
                      scrollbarWidth: "none",
                      msOverflowStyle: "none",
                    },
                  },
                  windows.map(function (w) {
                    return h(
                      "button",
                      {
                        key: w.index,
                        onClick: function () {
                          handleSelectWindow(w.index);
                        },
                        style: {
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "none",
                          background: w.active
                            ? "var(--dsw-alias-interactive-bg-active, #238636)"
                            : "rgba(255,255,255,0.05)",
                          color: "#fff",
                          fontSize: "11px",
                          cursor: "pointer",
                        },
                      },
                      w.index + ":" + w.name,
                    );
                  }),
                  h(
                    "button",
                    {
                      onClick: handleNewWindow,
                      title: "New window in this session",
                      style: {
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px dashed var(--dsw-alias-border-l2)",
                        background: "transparent",
                        color: "var(--dsw-alias-label-secondary)",
                        fontSize: "11px",
                        cursor: "pointer",
                      },
                    },
                    "+",
                  ),
                )
              : null,
            // Specialized 3-dots actions menu
            h(
              "div",
              { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
              h(
                "button",
                {
                  ref: tabActionsBtnRef,
                  type: "button",
                  title: "Actions (…)",
                  onClick: function (e) {
                    e.stopPropagation();
                    setTabActionsOpen(function (v) {
                      return !v;
                    });
                  },
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "26px",
                    height: "26px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    color: "var(--dsw-alias-label-secondary)",
                    cursor: "pointer",
                  },
                  onMouseEnter: function (e) {
                    e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
                  },
                  onMouseLeave: function (e) {
                    e.currentTarget.style.background = "transparent";
                  },
                },
                h(EllipsisGlyph, { size: 14 }),
              ),
              h(SelectDropdownMenu, {
                open: tabActionsOpen,
                anchorRef: tabActionsBtnRef,
                onClose: function () {
                  setTabActionsOpen(false);
                },
                items: [
                  { id: "move-top", label: "Move to Main Area", icon: h(EyeGlyph, { size: 13 }) },
                  {
                    id: "move-right",
                    label: "Move to Secondary Sidebar",
                    icon: h(DockToggleGlyph, { size: 13 }),
                  },
                  activeView === "terminal"
                    ? {
                        id: "refresh",
                        label: "Refresh Buffer",
                        icon: h(RefreshGlyph, { size: 13 }),
                      }
                    : null,
                  activeView === "terminal"
                    ? {
                        id: "clear",
                        label: "Clear Buffer (Ctrl+L)",
                        icon: h(TrashGlyph, { size: 13 }),
                      }
                    : null,
                  activeView === "terminal"
                    ? {
                        id: "new-window",
                        label: "New Window in Session",
                        icon: h(PlusGlyph, { size: 13 }),
                      }
                    : null,
                  activeView === "terminal"
                    ? {
                        id: "new-session",
                        label: "New Terminal Session",
                        icon: h(TerminalsGlyph, { size: 13 }),
                      }
                    : null,
                  activeView === "terminal"
                    ? {
                        id: "kill",
                        label: "Kill Current Session",
                        icon: h(TrashGlyph, { size: 13 }),
                        danger: true,
                      }
                    : null,
                  activeView === "container" && selectedContainer
                    ? {
                        id: "stop-container",
                        label: "Stop Container",
                        icon: h(TrashGlyph, { size: 13 }),
                      }
                    : null,
                  activeView === "container" && selectedContainer
                    ? {
                        id: "start-container",
                        label: "Start Container",
                        icon: h(PlusGlyph, { size: 13 }),
                      }
                    : null,
                ].filter(Boolean),
                onSelect: function (actionId) {
                  setTabActionsOpen(false);
                  // Move requests only; this panel drops its copy of the tab
                  // when the destination surface commits the transfer.
                  if (actionId === "move-top") {
                    if (activeView === "terminal" && selectedSession) {
                      tabMove.requestMove("top", {
                        id: selectedSession,
                        type: "terminal",
                        title: selectedSession,
                        session: selectedSession,
                      });
                    } else if (activeView === "container" && selectedContainer) {
                      tabMove.requestMove("top", {
                        id: selectedContainer,
                        type: "container",
                        title: selectedContainer,
                      });
                    } else if (activeView === "chat") {
                      tabMove.requestMove("top", {
                        id: "chat-main",
                        type: "chat",
                        title: "Conversation",
                      });
                    }
                  } else if (actionId === "move-right") {
                    if (activeView === "terminal" && selectedSession) {
                      tabMove.requestMove("right", {
                        id: selectedSession,
                        type: "terminal",
                        title: selectedSession,
                        session: selectedSession,
                      });
                    } else if (activeView === "container" && selectedContainer) {
                      tabMove.requestMove("right", {
                        id: selectedContainer,
                        type: "container",
                        title: selectedContainer,
                      });
                    }
                  } else if (actionId === "stop-container" && selectedContainer) {
                    fetch(QUOTAS_API + "/docker/containers/action", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ id: selectedContainer, action: "stop" }),
                    });
                  } else if (actionId === "start-container" && selectedContainer) {
                    fetch(QUOTAS_API + "/docker/containers/action", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ id: selectedContainer, action: "start" }),
                    });
                  } else if (actionId === "refresh") {
                    loadBuffer(selectedSession);
                  } else if (actionId === "clear") {
                    sendKey("C-l");
                  } else if (actionId === "new-window") {
                    handleNewWindow();
                  } else if (actionId === "new-session") {
                    setNewModal(true);
                  } else if (actionId === "kill") {
                    if (selectedSession) handleKill(selectedSession);
                  }
                },
              }),
            ),
            // Collapse / Expand toggle button (Panel Dock Icon)
            h(
              "button",
              {
                type: "button",
                onClick: function () {
                  setIsCollapsed(function (v) {
                    return !v;
                  });
                },
                title: isCollapsed ? "Expand Bottom Dock" : "Collapse Bottom Dock",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "var(--dsw-alias-label-secondary)",
                  cursor: "pointer",
                  padding: "4px",
                },
                onMouseEnter: function (e) {
                  e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
                },
                onMouseLeave: function (e) {
                  e.currentTarget.style.background = "transparent";
                },
              },
              h(DockToggleGlyph, {
                size: 14,
                style: {
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(90deg)",
                  transition: "transform 150ms ease",
                },
              }),
            ),
          ),
        ),
        // Body content: terminal or container view (rendered when not collapsed)
        !isCollapsed && activeView === "terminal"
          ? h(
              // Terminal Buffer Output
              "pre",
              {
                ref: terminalPreRef,
                style: {
                  flex: 1,
                  margin: 0,
                  padding: "12px 16px",
                  color: "var(--dsw-alias-label-primary, #c9d1d9)",
                  fontFamily:
                    "var(--ds-font-mono, 'JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', monospace)",
                  fontSize: "12.5px",
                  lineHeight: "1.48",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  cursor: "text",
                  background: "var(--dsw-alias-bg-layer-1, #0d1117)",
                },
                dangerouslySetInnerHTML: {
                  __html:
                    ansiToHtml(buffer) +
                    '<span style="display:inline-block;width:7px;height:14px;background:#7ee787;margin-left:2px;vertical-align:middle;animation:blink 1s step-start infinite;"></span>',
                },
              },
            )
          : activeView === "container"
            ? h(
                React.Fragment,
                null,
                // Container info bar
                (function () {
                  var selCont = containers.find(function (c) {
                    return c.id === selectedContainer;
                  });
                  if (!selCont)
                    return h(
                      "div",
                      {
                        style: {
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--dsw-alias-label-tertiary)",
                          fontSize: "13px",
                        },
                      },
                      "No container selected",
                    );
                  return h(
                    React.Fragment,
                    null,
                    // Container action bar
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 16px",
                          background: "var(--dsw-alias-bg-layer-2, #161b22)",
                          borderBottom:
                            "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                        },
                      },
                      h(
                        "div",
                        { style: { display: "flex", gap: "10px", alignItems: "center" } },
                        h(
                          "strong",
                          { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px" } },
                          selCont.name || selCont.id.substring(0, 12),
                        ),
                        h(
                          "code",
                          {
                            style: {
                              fontSize: "11px",
                              color: "var(--dsw-alias-label-secondary)",
                              background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.06))",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            },
                          },
                          selCont.image,
                        ),
                        h(
                          "span",
                          {
                            style: {
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background: selCont.isRunning
                                ? "rgba(63, 185, 80, 0.15)"
                                : "rgba(128,128,128,0.1)",
                              color: selCont.isRunning
                                ? "#3fb950"
                                : "var(--dsw-alias-label-tertiary)",
                            },
                          },
                          selCont.isRunning ? "RUNNING" : "STOPPED",
                        ),
                      ),
                      h(
                        "div",
                        { style: { display: "flex", gap: "6px" } },
                        selCont.isRunning
                          ? h(
                              "button",
                              {
                                onClick: function () {
                                  handleContainerAction(selCont.id, "stop");
                                },
                                style: {
                                  padding: "4px 10px",
                                  borderRadius: "5px",
                                  border: "1px solid rgba(248, 81, 73, 0.3)",
                                  background: "rgba(248, 81, 73, 0.08)",
                                  color: "#f85149",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                },
                              },
                              "Stop",
                            )
                          : h(
                              "button",
                              {
                                onClick: function () {
                                  handleContainerAction(selCont.id, "start");
                                },
                                style: {
                                  padding: "4px 10px",
                                  borderRadius: "5px",
                                  border: "none",
                                  background: "var(--dsw-alias-primary, #6366f1)",
                                  color: "#fff",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                },
                              },
                              "Start",
                            ),
                        h(
                          "button",
                          {
                            onClick: function () {
                              handleContainerAction(selCont.id, "restart");
                            },
                            style: {
                              padding: "4px 10px",
                              borderRadius: "5px",
                              border: "1px solid var(--dsw-alias-border-l1)",
                              background: "transparent",
                              color: "var(--dsw-alias-label-secondary)",
                              fontSize: "11px",
                              cursor: "pointer",
                            },
                          },
                          "Restart",
                        ),
                        h(
                          "button",
                          {
                            onClick: function () {
                              loadContainerLogs(selCont.id);
                            },
                            style: {
                              padding: "4px 10px",
                              borderRadius: "5px",
                              border: "1px solid var(--dsw-alias-border-l1)",
                              background: "transparent",
                              color: "var(--dsw-alias-label-secondary)",
                              fontSize: "11px",
                              cursor: "pointer",
                            },
                          },
                          h(RefreshGlyph, { size: 12 }),
                        ),
                      ),
                    ),
                    // Container logs
                    h(
                      "pre",
                      {
                        ref: terminalPreRef,
                        style: {
                          flex: 1,
                          margin: 0,
                          padding: "12px 16px",
                          color: "var(--dsw-alias-label-primary, #c9d1d9)",
                          fontFamily:
                            "var(--ds-font-mono, 'JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', monospace)",
                          fontSize: "12.5px",
                          lineHeight: "1.48",
                          overflowY: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          background: "var(--dsw-alias-bg-layer-1, #0d1117)",
                        },
                      },
                      containerLogs,
                    ),
                  );
                })(),
              )
            : null,
        newModal
          ? h(NewSessionModal, {
              onClose: function () {
                setNewModal(false);
              },
              onCreated: loadSessions,
            })
          : null,
      );
    }
    var FullPageTerminalsWorkspace = BottomTerminalPanel;

    // 7. DOCKABLE CONTAINERS WORKSPACE
    /**
     * Moves the active view or selected item to the top of the workspace.
     *
     * Emits a "dsh:tab-moved-to-top" custom event with details about the moved item.
     *
     * Fails silently if no active view or selected item is available.
     */
    function FullPageContainersWorkspace(props) {
      var onClose = props.onClose;
      var initialContainerId = props.initialContainerId;
      var state = React.useState({ containers: [], loading: true, error: null });
      var data = state[0],
        setData = state[1];
      var selectedContainerState = React.useState(null);
      var selectedContainer = selectedContainerState[0],
        setSelectedContainer = selectedContainerState[1];
      var logsState = React.useState("Loading container logs…");
      var logs = logsState[0],
        setLogs = logsState[1];
      var actionState = React.useState({});
      var actionMap = actionState[0],
        setActionMap = actionState[1];
      var containerRef = React.useRef(null);
      var isNarrowState = React.useState(false);
      var isNarrow = isNarrowState[0],
        setIsNarrow = isNarrowState[1];

      React.useLayoutEffect(function () {
        if (!containerRef.current) return;
        /**
         * Checks the width conditions for moving a terminal session or container to the right.
         * Guarantees that the selected session or container is removed from the active view.
         * Dispatches a "dsh:tab-moved-to-right" event with details of the moved item.
         * Fails silently if the conditions for moving are not met.
         */
        var checkWidth = function () {
          if (containerRef.current) {
            setIsNarrow(containerRef.current.clientWidth < 420);
          }
        };
        checkWidth();
        var obs = new ResizeObserver(checkWidth);
        obs.observe(containerRef.current);
        return function () {
          obs.disconnect();
        };
      }, []);

      var loadContainers = React.useCallback(
        function () {
          fetch(QUOTAS_API + "/docker/containers")
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              var list = res.containers || [];
              setData({ containers: list, loading: false, error: null });
              if (list.length > 0) {
                if (initialContainerId) {
                  var found = list.find(function (c) {
                    return c.id === initialContainerId;
                  });
                  setSelectedContainer(found || list[0]);
                } else if (!selectedContainer) {
                  setSelectedContainer(list[0]);
                }
              }
            })
            .catch(function (err) {
              setData({ containers: [], loading: false, error: err.message });
            });
        },
        [selectedContainer, initialContainerId],
      );

      var loadLogs = React.useCallback(function (cId) {
        if (!cId) return;
        fetch(QUOTAS_API + "/docker/containers/logs?id=" + encodeURIComponent(cId))
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            setLogs(res.logs || "(no logs)");
          })
          .catch(function (err) {
            setLogs("Error loading logs: " + err.message);
          });
      }, []);

      React.useEffect(
        function () {
          loadContainers();
        },
        [loadContainers],
      );
      React.useEffect(
        function () {
          if (selectedContainer) loadLogs(selectedContainer.id);
        },
        [selectedContainer, loadLogs],
      );

      /**
       * Handles different actions based on the actionId.
       *
       * Guarantees that the selected session is processed or the modal is set accordingly.
       * Returns nothing.
       * Fails by either refreshing the buffer, sending a key command, setting the collapse state, or handling session killing.
       */
      var handleAction = function (id, action) {
        setActionMap(function (s) {
          var n = Object.assign({}, s);
          n[id] = action;
          return n;
        });
        fetch(QUOTAS_API + "/docker/containers/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: id, action: action }),
        })
          .then(function () {
            loadContainers();
          })
          .finally(function () {
            setActionMap(function (s) {
              var n = Object.assign({}, s);
              delete n[id];
              return n;
            });
          });
      };

      return h(
        "div",
        {
          ref: containerRef,
          className: "dsh-containers-workspace",
          style: {
            width: "100%",
            height: "100%",
            background: "var(--dsw-alias-bg-layer-0, #000000)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "var(--dsw-alias-label-primary, #fff)",
            fontFamily: "var(--ds-font-sans, system-ui, sans-serif)",
          },
        },
        // Content Area (adaptive row / column based on container width)
        h(
          "div",
          {
            style: {
              display: "flex",
              flex: 1,
              overflow: "hidden",
              flexDirection: isNarrow ? "column" : "row",
            },
          },
          // Container List
          h(
            "div",
            {
              style: {
                width: isNarrow ? "100%" : "200px",
                maxHeight: isNarrow ? "130px" : "100%",
                borderRight: isNarrow
                  ? "none"
                  : "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))",
                borderBottom: isNarrow
                  ? "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))"
                  : "none",
                background: "var(--dsw-alias-bg-layer-0, #000000)",
                display: "flex",
                flexDirection: "column",
                padding: "6px",
                gap: "4px",
                overflowY: "auto",
                flexShrink: 0,
              },
            },
            data.containers.length === 0
              ? h(
                  "div",
                  {
                    style: {
                      padding: "12px 8px",
                      fontSize: "11px",
                      color: "var(--dsw-alias-label-tertiary, #666)",
                      textAlign: "center",
                    },
                  },
                  "No containers found",
                )
              : null,
            data.containers.map(function (c) {
              var isSel = selectedContainer && selectedContainer.id === c.id;
              return h(
                "div",
                {
                  key: c.id,
                  onClick: function () {
                    setSelectedContainer(c);
                  },
                  style: {
                    padding: "6px 8px",
                    borderRadius: "6px",
                    background: isSel
                      ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.18))"
                      : "transparent",
                    border: isSel
                      ? "1px solid var(--dsw-alias-primary, #6366f1)"
                      : "1px solid transparent",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  },
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "12px",
                        fontWeight: 600,
                        color: isSel ? "#fff" : "var(--dsw-alias-label-primary, #ccc)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                    },
                    c.name || c.id.substring(0, 12),
                  ),
                  h(
                    "span",
                    {
                      style: {
                        padding: "1px 4px",
                        borderRadius: "3px",
                        fontSize: "8.5px",
                        fontWeight: 700,
                        background: c.isRunning
                          ? "rgba(99, 102, 241, 0.2)"
                          : "rgba(128,128,128,0.15)",
                        color: c.isRunning
                          ? "var(--dsw-alias-primary, #6366f1)"
                          : "var(--dsw-alias-label-tertiary, #888)",
                      },
                    },
                    c.isRunning ? "RUNNING" : "STOPPED",
                  ),
                ),
                h(
                  "span",
                  {
                    style: {
                      fontSize: "10.5px",
                      color: "var(--dsw-alias-label-tertiary, #777)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                  },
                  c.image,
                ),
              );
            }),
          ),
          // Selected Container Details & Logs
          h(
            "div",
            {
              style: {
                flex: 1,
                display: "flex",
                flexDirection: "column",
                background: "var(--dsw-alias-bg-layer-0, #000000)",
                overflow: "hidden",
              },
            },
            // Container Logs Console
            h(
              "pre",
              {
                style: {
                  flex: 1,
                  margin: 0,
                  padding: "10px 12px",
                  color: "var(--dsw-alias-label-primary, #c9d1d9)",
                  fontFamily: "var(--ds-font-mono, monospace)",
                  fontSize: "11px",
                  lineHeight: "1.4",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "var(--dsw-alias-bg-layer-1, #080808)",
                },
              },
              logs,
            ),
          ),
        ),
      );
    }

    /**
     * Toggles the container action between "start" and "stop" based on the current state.
     *
     * This button changes its label to "Stop" when the container is running and to "Start" when it is stopped.
     * On click, it triggers the `handleContainerAction` function with the container ID and the appropriate action.
     *
     * Fails if `handleContainerAction` throws an error, leaving the button in its previous state.
     */
    function SelectDropdownMenu(props) {
      var open = props.open,
        onClose = props.onClose,
        items = props.items,
        onSelect = props.onSelect,
        anchorRef = props.anchorRef,
        position = props.position;
      var menuRef = React.useRef(null);
      var posState = React.useState({ top: 0, left: 0 });
      var pos = posState[0],
        setPos = posState[1];

      React.useLayoutEffect(
        function () {
          if (!open) return;
          var menuWidth = 190;
          var menuHeight = (items ? items.length : 4) * 36 + 10;
          if (position && typeof position.x === "number") {
            var top =
              position.y + menuHeight > window.innerHeight
                ? Math.max(8, position.y - menuHeight)
                : position.y;
            var left =
              position.x + menuWidth > window.innerWidth
                ? Math.max(8, position.x - menuWidth)
                : position.x;
            setPos({ top: Math.max(8, top), left: Math.max(8, left) });
          } else if (anchorRef && anchorRef.current) {
            var rect = anchorRef.current.getBoundingClientRect();
            var top2 =
              rect.bottom + menuHeight > window.innerHeight
                ? rect.top - menuHeight - 4
                : rect.bottom + 4;
            var left2 =
              rect.right - menuWidth < 10 ? Math.max(10, rect.left) : rect.right - menuWidth;
            setPos({ top: Math.max(8, top2), left: Math.max(8, left2) });
          } else if (menuRef.current && menuRef.current.parentElement) {
            var rect3 = menuRef.current.parentElement.getBoundingClientRect();
            var top3 =
              rect3.bottom + menuHeight > window.innerHeight
                ? rect3.top - menuHeight - 4
                : rect3.bottom + 4;
            var left3 =
              rect3.right - menuWidth < 10 ? Math.max(10, rect3.left) : rect3.right - menuWidth;
            setPos({ top: Math.max(8, top3), left: Math.max(8, left3) });
          }
        },
        [open, anchorRef, position, items ? items.length : 0],
      );

      React.useEffect(
        function () {
          if (!open) return;
          /**
           * Handles the pointer down event, indicating the user is interacting with a button.
           *
           * The caller must guarantee the button is interactable and visible.
           * This function will set the button's cursor to 'pointer' to indicate it is clickable.
           * On failure, it does nothing and returns undefined.
           */
          var handlePointerDown = function (e) {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
              if (anchorRef && anchorRef.current && anchorRef.current.contains(e.target)) return;
              if (menuRef.current.parentElement && menuRef.current.parentElement.contains(e.target))
                return;
              onClose();
            }
          };
          var timer = setTimeout(function () {
            document.addEventListener("pointerdown", handlePointerDown);
          }, 30);
          return function () {
            clearTimeout(timer);
            document.removeEventListener("pointerdown", handlePointerDown);
          };
        },
        [open, onClose, anchorRef],
      );

      if (!open) return null;

      return h(
        "div",
        {
          ref: menuRef,
          style: {
            position: "fixed",
            top: pos.top + "px",
            left: pos.left + "px",
            zIndex: 99999999,
            minWidth: "190px",
            background: "var(--dsw-alias-surface-l0, #1e1e2e)",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
            borderRadius: "8px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.65)",
            padding: "4px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          },
          onClick: function (e) {
            e.stopPropagation();
          },
        },
        items.map(function (item) {
          var isDanger = Boolean(item.danger);
          return h(
            "button",
            {
              key: item.id,
              type: "button",
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "7px 10px",
                borderRadius: "5px",
                border: "none",
                background: "transparent",
                color: isDanger ? "#f85149" : "var(--dsw-alias-label-primary)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 100ms",
              },
              onMouseEnter: function (e) {
                e.currentTarget.style.background = isDanger
                  ? "rgba(248, 81, 73, 0.15)"
                  : "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))";
              },
              onMouseLeave: function (e) {
                e.currentTarget.style.background = "transparent";
              },
              onClick: function (e) {
                e.stopPropagation();
                onSelect(item.id);
                onClose();
              },
            },
            item.icon
              ? h("span", { style: { display: "inline-flex", flexShrink: 0 } }, item.icon)
              : null,
            h("span", { style: { flex: 1 } }, item.label),
          );
        }),
      );
    }

    // Interactive Tmux Terminal Component (Unified for Main Area, Bottom Panel, and Right Sidebar)
    /**
     * Adjusts the layout based on the container's width, ensuring the selected container is removed from the active view.
     * Guarantees that the `isNarrow` state is updated to reflect the current width of the container.
     * Dispatches a "dsh:tab-moved-to-right" event if the container width meets the conditions for moving.
     * Fails silently if the width conditions are not met.
     */
    function InteractiveTmuxTerminal(props) {
      var sessionName = props.sessionName || "0";
      var style = props.style || {};
      var bufferState = React.useState("Connecting to " + sessionName + "…");
      var buffer = bufferState[0],
        setBuffer = bufferState[1];
      var preRef = React.useRef(null);
      var containerRef = React.useRef(null);
      var isFocusedState = React.useState(false);
      var isFocused = isFocusedState[0],
        setIsFocused = isFocusedState[1];

      var /** sendKey implementation. */
        sendKey = function (key) {
          fetch(QUOTAS_API + "/tmux/sessions/send-keys", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: sessionName, keys: key, isLiteral: false }),
          }).then(function () {
            fetch(
              QUOTAS_API + "/tmux/sessions/capture?ansi=1&name=" + encodeURIComponent(sessionName),
            )
              .then(function (r) {
                return r.json();
              })
              .then(function (res) {
                if (res && res.buffer !== undefined) setBuffer(res.buffer || "(empty)");
              });
          });
        };

      /**
       * Fails silently if the conditions for fetching containers are not met.
       * Returns a cleanup function to stop observing the container width.
       * On failure, no containers are loaded and the loading state remains unchanged.
       */
      var sendLiteral = function (text) {
        fetch(QUOTAS_API + "/tmux/sessions/send-keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: sessionName, keys: text, isLiteral: true }),
        }).then(function () {
          fetch(
            QUOTAS_API + "/tmux/sessions/capture?ansi=1&name=" + encodeURIComponent(sessionName),
          )
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              if (res && res.buffer !== undefined) setBuffer(res.buffer || "(empty)");
            });
        });
      };

      /**
       * Handles key down events to update the selected container or fetch logs.
       * Guarantees that the selected container is updated based on the key down action.
       * Returns nothing but updates the UI state with the selected container or logs.
       * Fails by setting the error state if fetching logs fails.
       */
      var handleKeyDown = function (e) {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (e.key === "Enter") {
          sendKey("Enter");
          e.preventDefault();
        } else if (e.key === "Backspace") {
          sendKey("BSpace");
          e.preventDefault();
        } else if (e.key === "Tab") {
          sendKey("Tab");
          e.preventDefault();
        } else if (e.key === "ArrowUp") {
          sendKey("Up");
          e.preventDefault();
        } else if (e.key === "ArrowDown") {
          sendKey("Down");
          e.preventDefault();
        } else if (e.key === "ArrowLeft") {
          sendKey("Left");
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          sendKey("Right");
          e.preventDefault();
        } else if (e.key === "Escape") {
          sendKey("Escape");
          e.preventDefault();
        } else if (e.ctrlKey) {
          if (e.key === "c" || e.key === "C") {
            sendKey("C-c");
            e.preventDefault();
          } else if (e.key === "d" || e.key === "D") {
            sendKey("C-d");
            e.preventDefault();
          } else if (e.key === "l" || e.key === "L") {
            sendKey("C-l");
            e.preventDefault();
          } else if (e.key === "z" || e.key === "Z") {
            sendKey("C-z");
            e.preventDefault();
          }
        } else if (e.key.length === 1 && !e.metaKey && !e.altKey) {
          sendLiteral(e.key);
          e.preventDefault();
        }
      };

      /**
       * Handles session exit by refreshing the buffer, sending a key command, setting the collapse state, or handling session killing.
       * Fails by refreshing the buffer, sending a key command, setting the collapse state, or handling session killing.
       * Guarantees that the action map is updated to reflect the new state.
       */
      var handleSessionExited = function () {
        if (props.onClose) {
          props.onClose();
        }
        window.dispatchEvent(
          new CustomEvent("dsh:close-terminal-tab", {
            detail: { id: sessionName, session: sessionName },
          }),
        );
      };

      React.useEffect(
        function () {
          var consecutiveErrors = 0;
          /**
           * Loads containers and updates the action map by removing the specified container.
           * Resolves the promise after loading containers and ensures the action map is updated.
           * Fails gracefully by removing the specified container from the action map.
           */
          var load = function () {
            fetch(
              QUOTAS_API + "/tmux/sessions/capture?ansi=1&name=" + encodeURIComponent(sessionName),
            )
              .then(function (r) {
                if (r.status === 404 || r.status === 410) {
                  handleSessionExited();
                  return null;
                }
                return r.json();
              })
              .then(function (res) {
                if (!res) return;
                if (
                  res.error &&
                  (res.error.indexOf("not found") !== -1 ||
                    res.error.indexOf("failed") !== -1 ||
                    res.error.indexOf("no server") !== -1 ||
                    res.error.indexOf("exited") !== -1)
                ) {
                  consecutiveErrors++;
                  if (consecutiveErrors >= 2) {
                    handleSessionExited();
                  }
                  return;
                }
                consecutiveErrors = 0;
                if (res && res.buffer !== undefined) setBuffer(res.buffer || "(empty)");
              })
              .catch(function () {
                consecutiveErrors++;
                if (consecutiveErrors >= 3) {
                  handleSessionExited();
                }
              });
          };
          load();
          var timer = setInterval(load, 500);
          return function () {
            clearInterval(timer);
          };
        },
        [sessionName],
      );

      React.useEffect(
        function () {
          if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
        },
        [buffer],
      );

      return h(
        "div",
        {
          ref: containerRef,
          tabIndex: 0,
          onKeyDown: handleKeyDown,
          onFocus: function () {
            setIsFocused(true);
          },
          onBlur: function () {
            setIsFocused(false);
          },
          onClick: function () {
            if (containerRef.current) containerRef.current.focus();
          },
          style: Object.assign(
            {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: "var(--dsw-alias-bg-layer-0, #000000)",
              outline: isFocused ? "1px solid var(--dsw-alias-primary, #6366f1)" : "none",
              outlineOffset: "-1px",
              cursor: "text",
              position: "relative",
              minHeight: 0,
              overflow: "hidden",
            },
            style,
          ),
        },
        h("pre", {
          ref: preRef,
          dangerouslySetInnerHTML: {
            __html:
              ansiToHtml(buffer) +
              '<span style="display:inline-block;width:7px;height:14px;background:#7ee787;margin-left:2px;vertical-align:middle;animation:blink 1s step-start infinite;"></span>',
          },
          style: {
            flex: 1,
            margin: 0,
            padding: "12px 16px",
            color: "var(--dsw-alias-label-primary, #c9d1d9)",
            fontFamily: "var(--ds-font-mono, 'JetBrains Mono', 'Fira Code', 'Menlo', monospace)",
            fontSize: "12.5px",
            lineHeight: "1.48",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            background: "transparent",
          },
        }),
      );
    }

    // Empty-area new-tab picker: see client-empty-area-new-tab-picker.js
    // (prepended to this bundle at build time).
    var EmptyAreaNewTabPicker = __dshCreateEmptyAreaNewTabPicker({
      h: h,
      tabMove: tabMove,
      ChatGlyph: ChatGlyph,
      TerminalsGlyph: TerminalsGlyph,
      ContainersGlyph: ContainersGlyph,
    });

    // Shared "move tab to another surface" / "close tab" menu items and
    // protocol-safe move action: see client-tab-move-menu.js (prepended to
    // this bundle at build time). Used by the main area's tab bar
    // (client-main-area-tab-bar.js) and the secondary sidebar's tab bar
    // (client-secondary-sidebar-tab-bar.js).
    var tabMoveMenu = __dshCreateTabMoveMenu({
      h: h,
      tabMove: tabMove,
      glyphs: {
        top: EyeGlyph,
        bottom: PanelBottomGlyph,
        right: PanelRightGlyph,
        close: TrashGlyph,
      },
    });

    // Shared tab-type -> icon glyph resolver: see client-tab-type-glyph.js
    // (prepended to this bundle at build time). Used by every area's tab
    // strip.
    var tabTypeGlyph = __dshCreateTabTypeGlyph({
      h: h,
      TerminalsGlyph: TerminalsGlyph,
      ContainersGlyph: ContainersGlyph,
      FileGlyph: FileGlyph,
      RepoGlyph: RepoGlyph,
      ChatGlyph: ChatGlyph,
    });

    // Secondary sidebar tab bar: see client-secondary-sidebar-tab-bar.js
    // (prepended to this bundle at build time).
    var RightSidebarDock = __dshCreateSecondarySidebarTabBar({
      React: React,
      h: h,
      tabMove: tabMove,
      tabMoveMenu: tabMoveMenu,
      tabTypeGlyph: tabTypeGlyph,
      EllipsisGlyph: EllipsisGlyph,
      DockToggleGlyph: DockToggleGlyph,
      SelectDropdownMenu: SelectDropdownMenu,
      EmptyAreaNewTabPicker: EmptyAreaNewTabPicker,
      InteractiveTmuxTerminal: InteractiveTmuxTerminal,
      FullPageContainersWorkspace: FullPageContainersWorkspace,
    });

    /**
     * Dispatches a "dsh:tab-moved-to-top" custom event with the specified tab details.
     *
     * Emits a custom event when the button is clicked, indicating the tab has been moved to the top.
     * The event detail includes the tab's ID, type, and title.
     */
    function getCenterBounds() {
      if (typeof document === "undefined") return { left: 240, right: 0, top: 0 };
      var centerEl = document.querySelector('div[class*="centerCol"], [class*="centerCol"], main');
      if (centerEl && centerEl.getBoundingClientRect) {
        var rect = centerEl.getBoundingClientRect();
        if (rect.width > 0) {
          return {
            left: Math.max(0, Math.round(rect.left)),
            right: Math.max(0, Math.round(window.innerWidth - rect.right)),
            top: Math.max(0, Math.round(rect.top)),
          };
        }
      }
      var isSwapped = document.body.classList.contains("dsh-main-sidebar-right");
      var customSecondary =
        typeof window !== "undefined" && window.__dsh_right_sidebar_width__
          ? window.__dsh_right_sidebar_width__
          : 0;
      var detailsEl = document.querySelector(
        'div[class*="detailsCol"], div[class*="details"], div[data-details]',
      );
      var detailsW =
        detailsEl && detailsEl.getBoundingClientRect ? detailsEl.getBoundingClientRect().width : 0;
      var secondaryW = Math.max(customSecondary, detailsW);

      var sidebarEl = document.querySelector('div[class*="sidebarCol"]');
      var primaryW =
        sidebarEl && sidebarEl.getBoundingClientRect && sidebarEl.getBoundingClientRect().width > 0
          ? sidebarEl.getBoundingClientRect().width
          : 240;

      if (isSwapped) {
        return {
          left: secondaryW,
          right: primaryW,
          top: 0,
        };
      }

      return {
        left: primaryW,
        right: secondaryW,
        top: 0,
      };
    }

    /**
     * Sets the focus to the top container tab when the button is clicked.
     *
     * The caller must ensure the button is clicked to trigger the event.
     * The function dispatches a custom event to move the tab to the top.
     */
    function useCenterBounds() {
      var boundsState = React.useState(getCenterBounds);
      var bounds = boundsState[0],
        setBounds = boundsState[1];

      React.useEffect(function () {
        /**
         * Updates the button's style and dispatches a custom event when clicked.
         *
         * Guarantees the button's style is updated and a "dsh:tab-moved-to-top" event is dispatched on click.
         *
         * Fails if the custom event cannot be dispatched.
         */
        var update = function () {
          var next = getCenterBounds();
          setBounds(function (prev) {
            if (prev.left !== next.left || prev.right !== next.right || prev.top !== next.top) {
              return next;
            }
            return prev;
          });
        };
        window.addEventListener("dsh:right-sidebar-changed", update);
        window.addEventListener("resize", update);
        window.addEventListener("pointermove", update);
        var timer = setInterval(update, 100);
        return function () {
          window.removeEventListener("dsh:right-sidebar-changed", update);
          window.removeEventListener("resize", update);
          window.removeEventListener("pointermove", update);
          clearInterval(timer);
        };
      }, []);

      return bounds;
    }

    /**
     * Controls the visibility and width of the RightSidebarDock component.
     *
     * @param {boolean} isOpen - Indicates whether the sidebar is open.
     * @param {Function} setIsOpen - Function to toggle the sidebar's open state.
     * @param {number} width - Current width of the sidebar.
     * @param {Function} setWidth - Function to set the sidebar's width.
     */
    function MainViewTerminalOccupant(props) {
      var sessionName = props.sessionName || "0";
      var bounds = useCenterBounds();
      var panelHeightState = React.useState(function () {
        if (typeof window !== "undefined" && window.__dsh_panel_height__) {
          return window.__dsh_panel_height__;
        }
        return "38px";
      });
      var panelHeight = panelHeightState[0],
        setPanelHeight = panelHeightState[1];

      React.useEffect(function () {
        /**
         * Adjusts the layout bounds based on the secondary sidebar width and state.
         * Ensures that the right sidebar width is broadcasted to the window object.
         * Fails silently if the window or document is not defined.
         */
        var onGeom = function (e) {
          if (e && e.detail && e.detail.height) {
            setPanelHeight(e.detail.height);
          }
        };
        window.addEventListener("dsh:panel-geometry-changed", onGeom);
        return function () {
          window.removeEventListener("dsh:panel-geometry-changed", onGeom);
        };
      }, []);

      return h(
        "div",
        {
          className: "dsh-mainview-terminal",
          style: {
            position: "fixed",
            top: bounds.top + 38 + "px",
            left: bounds.left + "px",
            right: bounds.right + "px",
            bottom: panelHeight,
            background: "var(--dsw-alias-bg-layer-0, #000000)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--ds-font-mono, monospace)",
          },
        },
        h(InteractiveTmuxTerminal, { sessionName: sessionName }),
      );
    }

    /**
     * Updates the secondary sidebar width based on the `isOpen` state and `width` of the panes.
     * Guarantees that the sidebar width is updated in the DOM and a custom event is dispatched.
     * Returns `null` if the sidebar is not open, otherwise returns a cleanup function to remove the event listener.
     * Fails gracefully by returning `null` if the sidebar is not open.
     */
    function MainViewContainerOccupant(props) {
      var bounds = useCenterBounds();
      var panelHeightState = React.useState(function () {
        if (typeof window !== "undefined" && window.__dsh_panel_height__) {
          return window.__dsh_panel_height__;
        }
        return "38px";
      });
      var panelHeight = panelHeightState[0],
        setPanelHeight = panelHeightState[1];

      React.useEffect(function () {
        /**
         * Closes the menu by clearing the timer and removing the pointerdown event listener.
         * Guarantees that the menu will be removed from the DOM if `isOpen` is false when this function is called.
         * Returns a cleanup function that should be called when the menu is no longer needed.
         * Fails if the menu is not open, in which case it returns null.
         */
        var onGeom = function (e) {
          if (e && e.detail && e.detail.height) {
            setPanelHeight(e.detail.height);
          }
        };
        window.addEventListener("dsh:panel-geometry-changed", onGeom);
        return function () {
          window.removeEventListener("dsh:panel-geometry-changed", onGeom);
        };
      }, []);

      return h(
        "div",
        {
          className: "dsh-mainview-container",
          style: {
            position: "fixed",
            top: bounds.top + 36 + "px",
            left: bounds.left + "px",
            right: bounds.right + "px",
            bottom: panelHeight,
            background: "var(--dsw-alias-bg-layer-0, #000000)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          },
        },
        h(FullPageContainersWorkspace, { onClose: props.onClose }),
      );
    }

    /**
     * Stops the propagation of the mouse event and updates the active tab and tabs list.
     * If the tab is not found in the previous list, it is added. The view opens, and the
     * active tab is set to the given tab.
     *
     * @param {MouseEvent} e - The mouse event being handled.
     * @returns {void} - Does not return anything but modifies the state.
     */
    function MainViewFileEditorOccupant(props) {
      var filePath = props.filePath || "";
      var fileName = props.fileName || (filePath ? filePath.split("/").pop() : "File");
      var onClose = props.onClose;
      var bounds = useCenterBounds();

      var contentState = React.useState("");
      var content = contentState[0],
        setContent = contentState[1];
      var originalContentState = React.useState("");
      var originalContent = originalContentState[0],
        setOriginalContent = originalContentState[1];
      var loadingState = React.useState(true);
      var loading = loadingState[0],
        setLoading = loadingState[1];
      var savingState = React.useState(false);
      var saving = savingState[0],
        setSaving = savingState[1];
      var errorState = React.useState(null);
      var error = errorState[0],
        setError = errorState[1];
      var statusMsgState = React.useState("");
      var statusMsg = statusMsgState[0],
        setStatusMsg = statusMsgState[1];

      var isDirty = content !== originalContent;

      React.useEffect(
        function () {
          setLoading(true);
          setError(null);
          fetch(QUOTAS_API + "/fs/read?path=" + encodeURIComponent(filePath))
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              if (res.error) {
                setError(res.error);
              } else {
                setContent(res.content || "");
                setOriginalContent(res.content || "");
              }
            })
            .catch(function (err) {
              setError(err.message);
            })
            .finally(function () {
              setLoading(false);
            });
        },
        [filePath],
      );

      /**
       * Handles the start of a resize event, preventing default actions, setting the resizing state, and removing event listeners for sidebar and tab movement.
       *
       * Guarantees that sidebar and tab movement event listeners are removed when resizing starts.
       * Fails silently if the width conditions do not meet the criteria for moving a tab to the right.
       */
      var handleSave = function () {
        if (saving) return;
        setSaving(true);
        setStatusMsg("Saving…");
        fetch(QUOTAS_API + "/fs/write", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: filePath, content: content }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            if (res.error) {
              setStatusMsg("Error: " + res.error);
            } else {
              setOriginalContent(content);
              setStatusMsg("Saved!");
              setTimeout(function () {
                setStatusMsg("");
              }, 2000);
            }
          })
          .catch(function (err) {
            setStatusMsg("Save failed: " + err.message);
          })
          .finally(function () {
            setSaving(false);
          });
      };

      React.useEffect(
        function () {
          var /** onKeyDown implementation. */
            onKeyDown = function (e) {
              if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
                e.preventDefault();
                handleSave();
              }
            };
          window.addEventListener("keydown", onKeyDown);
          return function () {
            window.removeEventListener("keydown", onKeyDown);
          };
        },
        [content, filePath],
      );

      var lineCount = (content.match(/\n/g) || []).length + 1;
      var lineNumbers = [];
      for (var li = 1; li <= Math.min(lineCount, 5000); li++) {
        lineNumbers.push(li);
      }

      return h(
        "div",
        {
          className: "dsh-mainview-monaco",
          style: {
            position: "fixed",
            top: bounds.top + 36 + "px",
            left: bounds.left + "px",
            right: bounds.right + "px",
            bottom:
              typeof window !== "undefined" && window.__dsh_panel_height__
                ? window.__dsh_panel_height__
                : "38px",
            background: "var(--dsw-alias-surface-l0, #13141f)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--ds-font-sans, system-ui, sans-serif)",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
              background: "var(--dsw-alias-surface-l1, #181926)",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              userSelect: "none",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 } },
            h(
              "span",
              { style: { color: "var(--dsw-alias-primary, #6366f1)", display: "inline-flex" } },
              h(FileGlyph, { size: 16 }),
            ),
            h(
              "strong",
              {
                style: {
                  color: "var(--dsw-alias-label-primary)",
                  fontSize: "13px",
                  fontWeight: 600,
                },
              },
              fileName,
            ),
            isDirty
              ? h(
                  "span",
                  {
                    title: "Unsaved changes",
                    style: { color: "#eab308", fontSize: "14px", lineHeight: 1 },
                  },
                  "●",
                )
              : null,
            h(
              "span",
              {
                style: {
                  color: "var(--dsw-alias-label-tertiary)",
                  fontSize: "11px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              },
              filePath,
            ),
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            statusMsg
              ? h(
                  "span",
                  {
                    style: {
                      fontSize: "12px",
                      color: statusMsg.startsWith("Error")
                        ? "var(--dsw-alias-state-error-primary, #f85149)"
                        : "var(--dsw-alias-primary, #6366f1)",
                    },
                  },
                  statusMsg,
                )
              : null,
            h(
              "button",
              {
                type: "button",
                onClick: handleSave,
                disabled: saving || !isDirty,
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  height: "26px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--dsw-alias-border-l1)",
                  background: isDirty ? "var(--dsw-alias-primary, #6366f1)" : "transparent",
                  color: isDirty ? "#fff" : "var(--dsw-alias-label-secondary)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: saving || !isDirty ? "default" : "pointer",
                  opacity: saving || !isDirty ? 0.6 : 1,
                  transition: "all 120ms ease",
                },
              },
              saving ? "Saving…" : "Save (⌘S)",
            ),
            h(
              "button",
              {
                type: "button",
                onClick: onClose,
                title: "Close Editor Tab",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  background: "transparent",
                  border: "none",
                  color: "var(--dsw-alias-label-secondary)",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background 100ms, color 100ms",
                },
                onMouseEnter: function (e) {
                  e.currentTarget.style.background =
                    "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))";
                },
                onMouseLeave: function (e) {
                  e.currentTarget.style.background = "transparent";
                },
              },
              "✕",
            ),
          ),
        ),
        h(
          "div",
          {
            style: {
              flex: 1,
              position: "relative",
              display: "flex",
              overflow: "hidden",
              background: "var(--dsw-alias-surface-l0, #13141f)",
            },
          },
          loading
            ? h(
                "div",
                { style: { padding: "24px", color: "var(--dsw-alias-label-secondary)" } },
                "Loading file…",
              )
            : error
              ? h(
                  "div",
                  {
                    style: {
                      padding: "24px",
                      color: "var(--dsw-alias-state-error-primary, #f85149)",
                    },
                  },
                  "Error: " + error,
                )
              : h(
                  "div",
                  { style: { display: "flex", width: "100%", height: "100%", overflow: "hidden" } },
                  h(
                    "div",
                    {
                      style: {
                        width: "44px",
                        padding: "16px 8px 16px 0",
                        boxSizing: "border-box",
                        textAlign: "right",
                        userSelect: "none",
                        color: "var(--dsw-alias-label-tertiary, #6e7681)",
                        fontFamily: "var(--ds-font-mono, monospace)",
                        fontSize: "12px",
                        lineHeight: "1.6",
                        borderRight: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                        background: "var(--dsw-alias-surface-l0, #13141f)",
                        opacity: 0.6,
                      },
                    },
                    lineNumbers.map(function (num) {
                      return h("div", { key: num }, num);
                    }),
                  ),
                  h("textarea", {
                    value: content,
                    onChange: function (e) {
                      setContent(e.target.value);
                    },
                    spellCheck: false,
                    style: {
                      flex: 1,
                      height: "100%",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      padding: "16px 20px",
                      boxSizing: "border-box",
                      fontFamily: "var(--ds-font-mono, monospace)",
                      fontSize: "13px",
                      lineHeight: "1.6",
                      background: "transparent",
                      color: "var(--dsw-alias-label-primary)",
                      tabSize: 2,
                    },
                  }),
                ),
        ),
      );
    }

    /**
     * Handles tab-related actions such as moving to the top, moving to the bottom, closing, or collapsing.
     *
     * Emits custom events for tab movement and collapse actions and updates the list of tabs accordingly.
     *
     * @param {string} act - The action type: 'move-top', 'move-bottom', 'close-tab', or 'collapse'.
     * @param {object} [activeTabObj] - The tab object being acted upon.
     * Emits 'dsh:tab-moved-to-top', 'dsh:tab-moved-to-bottom', or 'dsh:tab-collapsed' events.
     * Updates the list of tabs by removing the affected tab.
     */
    function MainViewRepoOccupant(props) {
      var repoPath = props.repoPath || "";
      var repoName = props.repoName || (repoPath ? repoPath.split("/").pop() : "Repository");
      var onClose = props.onClose;

      var tabState = React.useState("code"); // "code" | "changes" | "history" | "branches"
      var activeTab = tabState[0],
        setActiveTab = tabState[1];

      var overviewState = React.useState(null);
      var overview = overviewState[0],
        setOverview = overviewState[1];

      var subPathState = React.useState("");
      var subPath = subPathState[0],
        setSubPath = subPathState[1];

      var statusState = React.useState({ branch: "main", ahead: 0, behind: 0, files: [] });
      var status = statusState[0],
        setStatus = statusState[1];

      var logState = React.useState([]);
      var log = logState[0],
        setLog = logState[1];

      var branchesState = React.useState([]);
      var branches = branchesState[0],
        setBranches = branchesState[1];

      var diffState = React.useState("");
      var diffText = diffState[0],
        setDiffText = diffState[1];

      var selectedDiffFileState = React.useState(null);
      var selectedDiffFile = selectedDiffFileState[0],
        setSelectedDiffFile = selectedDiffFileState[1];

      var loadingState = React.useState(false);
      var loading = loadingState[0],
        setLoading = loadingState[1];

      var commitMsgState = React.useState("");
      var commitMsg = commitMsgState[0],
        setCommitMsg = commitMsgState[1];

      var actionStatusState = React.useState("");
      var actionStatus = actionStatusState[0],
        setActionStatus = actionStatusState[1];

      var cloneOpenState = React.useState(false);
      var isCloneOpen = cloneOpenState[0],
        setCloneOpen = cloneOpenState[1];

      var branchPickerOpenState = React.useState(false);
      var isBranchPickerOpen = branchPickerOpenState[0],
        setBranchPickerOpen = branchPickerOpenState[1];
      var branchSearchState = React.useState("");
      var branchSearch = branchSearchState[0],
        setBranchSearch = branchSearchState[1];

      var fetchOverview = React.useCallback(
        function (curSubPath) {
          var sp = curSubPath !== undefined ? curSubPath : subPath;
          fetch(
            QUOTAS_API +
              "/git/overview?path=" +
              encodeURIComponent(repoPath) +
              "&subpath=" +
              encodeURIComponent(sp || ""),
          )
            .then(function (r) {
              return r.json();
            })
            .then(function (data) {
              if (data && !data.error) setOverview(data);
            })
            .catch(function () {});
        },
        [repoPath, subPath],
      );

      var fetchDiff = React.useCallback(
        function (file) {
          var url = QUOTAS_API + "/git/diff?path=" + encodeURIComponent(repoPath);
          if (file) url += "&file=" + encodeURIComponent(file);
          fetch(url)
            .then(function (r) {
              return r.json();
            })
            .then(function (data) {
              if (data && data.diff !== undefined) setDiffText(data.diff);
            })
            .catch(function () {});
        },
        [repoPath],
      );

      var fetchRepoData = React.useCallback(
        function () {
          setLoading(true);
          Promise.all([
            fetch(
              QUOTAS_API +
                "/git/overview?path=" +
                encodeURIComponent(repoPath) +
                "&subpath=" +
                encodeURIComponent(subPath || ""),
            ).then(function (r) {
              return r.json();
            }),
            fetch(QUOTAS_API + "/git/status?path=" + encodeURIComponent(repoPath)).then(
              function (r) {
                return r.json();
              },
            ),
            fetch(QUOTAS_API + "/git/log?path=" + encodeURIComponent(repoPath)).then(function (r) {
              return r.json();
            }),
            fetch(QUOTAS_API + "/git/branches?path=" + encodeURIComponent(repoPath)).then(
              function (r) {
                return r.json();
              },
            ),
          ])
            .then(function (results) {
              if (results[0] && !results[0].error) setOverview(results[0]);
              if (results[1] && !results[1].error) setStatus(results[1]);
              if (results[2] && results[2].commits) setLog(results[2].commits);
              if (results[3] && results[3].branches) setBranches(results[3].branches);
            })
            .catch(function () {})
            .finally(function () {
              setLoading(false);
            });
        },
        [repoPath, subPath],
      );

      React.useEffect(
        function () {
          fetchRepoData();
        },
        [fetchRepoData],
      );

      React.useEffect(
        function () {
          if (activeTab === "changes") {
            fetchDiff(selectedDiffFile);
          }
        },
        [activeTab, selectedDiffFile, fetchDiff],
      );

      /**
       * Adjusts the bounds of the RightSidebarDock component based on navigation events.
       *
       * Guarantees that the bounds are updated only when the left, right, or top values change.
       * Fails to update if no changes occur between events.
       */
      var handleNavigateSubPath = function (newSp) {
        setSubPath(newSp);
        fetchOverview(newSp);
      };

      var /** handleCommitAndPush implementation. */
        handleCommitAndPush = function () {
          if (!commitMsg.trim()) return;
          setActionStatus("Committing changes…");
          fetch(QUOTAS_API + "/git/commit", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: repoPath, message: commitMsg }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              if (res.error) {
                setActionStatus("Commit failed: " + res.error);
              } else {
                setActionStatus("Pushing to remote…");
                return fetch(QUOTAS_API + "/git/push", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ path: repoPath }),
                });
              }
            })
            .then(function (r) {
              return r ? r.json() : null;
            })
            .then(function (res) {
              if (res && res.error) setActionStatus("Push info: " + res.error);
              else setActionStatus("Committed & pushed!");
              setCommitMsg("");
              fetchRepoData();
              if (activeTab === "changes") fetchDiff(selectedDiffFile);
              setTimeout(function () {
                setActionStatus("");
              }, 3000);
            })
            .catch(function (err) {
              setActionStatus("Action failed: " + err.message);
            });
        };

      /**
       * Discards any unsaved changes and removes the listener for panel geometry changes.
       * Fails silently if the window or document is not defined.
       * Returns a cleanup function to remove the event listener.
       */
      var handleDiscardChanges = function (file) {
        if (
          !confirm(
            file
              ? "Discard all changes in " + file + "?"
              : "Discard all unstaged changes and untracked files?",
          )
        )
          return;
        setActionStatus("Discarding changes…");
        fetch(QUOTAS_API + "/git/discard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: repoPath, file: file }),
        }).then(function () {
          fetchRepoData();
          fetchDiff(null);
          setSelectedDiffFile(null);
          setActionStatus("Changes discarded.");
          setTimeout(function () {
            setActionStatus("");
          }, 2500);
        });
      };

      var /** handleStashChanges implementation. */
        handleStashChanges = function () {
          setActionStatus("Stashing changes…");
          fetch(QUOTAS_API + "/git/stash", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: repoPath }),
          }).then(function () {
            fetchRepoData();
            fetchDiff(null);
            setActionStatus("Changes stashed.");
            setTimeout(function () {
              setActionStatus("");
            }, 2500);
          });
        };

      var /** handleSwitchBranch implementation. */
        handleSwitchBranch = function (bName, createNew) {
          setActionStatus("Switching branch to " + bName + "…");
          fetch(QUOTAS_API + "/git/checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: repoPath, branch: bName, create: Boolean(createNew) }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              if (res.error) {
                alert("Checkout failed: " + res.error);
              } else {
                setBranchPickerOpen(false);
                fetchRepoData();
                setActionStatus("Switched to " + bName);
                setTimeout(function () {
                  setActionStatus("");
                }, 2500);
              }
            });
        };

      /**
       * Removes the event listener for panel geometry changes.
       * Guarantees that the "dsh:panel-geometry-changed" event listener is removed.
       * On failure, no action is taken as the function does not handle errors.
       */
      var handleCreateNewBranch = function () {
        var name = prompt("New branch name:");
        if (name && name.trim()) {
          handleSwitchBranch(name.trim(), true);
        }
      };

      var curBranch = (overview && overview.branch) || status.branch || "main";
      var remoteUrl = (overview && overview.remoteUrl) || "";
      var repoDisplayName =
        overview && overview.owner && overview.repoName
          ? overview.owner + " / " + overview.repoName
          : repoName;
      var bounds = useCenterBounds();

      return h(
        "div",
        {
          className: "dsh-mainview-repo",
          style: {
            position: "fixed",
            top: bounds.top + 36 + "px",
            left: bounds.left + "px",
            right: bounds.right + "px",
            bottom:
              typeof window !== "undefined" && window.__dsh_panel_height__
                ? window.__dsh_panel_height__
                : "38px",
            background: "var(--dsw-alias-surface-l0, #13141f)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--ds-font-sans, system-ui, -apple-system, sans-serif)",
            color: "var(--dsw-alias-label-primary)",
          },
        },
        // 1. TOP HEADER & GITHUB ACTIONS
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 18px",
              background: "var(--dsw-alias-surface-l1, #181926)",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              userSelect: "none",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 } },
            h(
              "span",
              { style: { color: "var(--dsw-alias-primary, #6366f1)", display: "inline-flex" } },
              h(RepoGlyph, { size: 18 }),
            ),
            h(
              "strong",
              {
                style: {
                  color: "var(--dsw-alias-label-primary)",
                  fontSize: "14px",
                  fontWeight: 600,
                },
              },
              repoDisplayName,
            ),
            h(
              "span",
              {
                style: {
                  fontSize: "11px",
                  padding: "2px 7px",
                  borderRadius: "12px",
                  border: "1px solid var(--dsw-alias-border-l1)",
                  color: "var(--dsw-alias-label-secondary)",
                  fontWeight: 500,
                },
              },
              "Public",
            ),
            h(
              "span",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "var(--dsw-alias-primary, #6366f1)",
                  fontSize: "12px",
                  fontWeight: 600,
                },
              },
              "⎇ " + curBranch,
            ),
            status.ahead > 0 || status.behind > 0
              ? h(
                  "span",
                  { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } },
                  (status.ahead > 0 ? "↑" + status.ahead + " " : "") +
                    (status.behind > 0 ? "↓" + status.behind : ""),
                )
              : null,
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px", position: "relative" } },
            remoteUrl
              ? h(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      window.open(remoteUrl.replace(/\.git$/, ""), "_blank");
                    },
                    title: "Open on GitHub",
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      height: "26px",
                      padding: "0 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--dsw-alias-border-l1)",
                      background: "transparent",
                      color: "var(--dsw-alias-label-secondary)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 500,
                    },
                  },
                  "Open on GitHub ↗",
                )
              : null,
            h(
              "div",
              { style: { position: "relative" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: function () {
                    setCloneOpen(!isCloneOpen);
                  },
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    height: "26px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: "var(--dsw-alias-primary, #238636)",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  },
                },
                "<> Code ▾",
              ),
              isCloneOpen
                ? h(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        top: "32px",
                        right: 0,
                        width: "320px",
                        padding: "12px",
                        borderRadius: "8px",
                        background: "var(--dsw-alias-surface-l1, #181926)",
                        border: "1px solid var(--dsw-alias-border-l1)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        zIndex: 100,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      },
                    },
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      "Clone repository:",
                    ),
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "6px" } },
                      h("input", {
                        type: "text",
                        readOnly: true,
                        value: remoteUrl || "file://" + repoPath,
                        style: {
                          flex: 1,
                          padding: "5px 8px",
                          borderRadius: "5px",
                          border: "1px solid var(--dsw-alias-border-l1)",
                          background: "var(--dsw-alias-surface-l0)",
                          color: "var(--dsw-alias-label-primary)",
                          fontFamily: "var(--ds-font-mono, monospace)",
                          fontSize: "11px",
                          outline: "none",
                        },
                      }),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: function () {
                            if (navigator.clipboard)
                              navigator.clipboard.writeText(remoteUrl || repoPath);
                            alert("Copied clone URL to clipboard!");
                            setCloneOpen(false);
                          },
                          style: {
                            height: "26px",
                            padding: "0 8px",
                            borderRadius: "5px",
                            border: "1px solid var(--dsw-alias-border-l1)",
                            background: "var(--dsw-alias-primary, #6366f1)",
                            color: "#fff",
                            fontSize: "11px",
                            cursor: "pointer",
                          },
                        },
                        "Copy",
                      ),
                    ),
                  )
                : null,
            ),
            h(
              "button",
              {
                type: "button",
                onClick: fetchRepoData,
                disabled: loading,
                title: "Refresh Git Status",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  height: "26px",
                  padding: "0 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--dsw-alias-border-l1)",
                  background: "transparent",
                  color: "var(--dsw-alias-label-secondary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                  transition: "all 120ms ease",
                },
              },
              loading ? "Refreshing…" : "↻ Refresh",
            ),
            h(
              "button",
              {
                type: "button",
                onClick: onClose,
                title: "Close Repo Tab",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  background: "transparent",
                  border: "none",
                  color: "var(--dsw-alias-label-secondary)",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background 100ms, color 100ms",
                },
                onMouseEnter: function (e) {
                  e.currentTarget.style.background =
                    "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))";
                },
                onMouseLeave: function (e) {
                  e.currentTarget.style.background = "transparent";
                },
              },
              "✕",
            ),
          ),
        ),

        // 2. GITHUB TAB NAVIGATION
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 18px",
              background: "var(--dsw-alias-surface-l0, #13141f)",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
            },
          },
          [
            { id: "code", label: "<> Code", count: overview ? overview.totalCommits : null },
            { id: "changes", label: "+/- Changes", count: status.files ? status.files.length : 0 },
            { id: "history", label: "◷ Commits", count: log.length },
            { id: "branches", label: "⎇ Branches", count: branches.length },
          ].map(function (subTab) {
            var isSel = activeTab === subTab.id;
            return h(
              "button",
              {
                key: subTab.id,
                type: "button",
                onClick: function () {
                  setActiveTab(subTab.id);
                },
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border:
                    "1px solid " + (isSel ? "var(--dsw-alias-primary, #6366f1)" : "transparent"),
                  background: isSel
                    ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.15))"
                    : "transparent",
                  color: isSel
                    ? "var(--dsw-alias-primary, #6366f1)"
                    : "var(--dsw-alias-label-secondary)",
                  fontSize: "12.5px",
                  fontWeight: isSel ? 600 : 500,
                  cursor: "pointer",
                  transition: "all 120ms ease",
                },
              },
              h("span", null, subTab.label),
              subTab.count !== null
                ? h(
                    "span",
                    {
                      style: {
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: isSel
                          ? "rgba(99, 102, 241, 0.25)"
                          : "var(--dsw-alias-surface-l1, rgba(128,128,128,0.15))",
                        color: isSel
                          ? "var(--dsw-alias-primary, #6366f1)"
                          : "var(--dsw-alias-label-tertiary)",
                      },
                    },
                    subTab.count,
                  )
                : null,
            );
          }),
        ),

        // 3. MAIN TAB BODIES
        h(
          "div",
          { style: { flex: 1, overflowY: "auto", padding: "16px 20px" } },

          // === TAB: CODE (GITHUB OVERVIEW, FILE TREE, README, STATS) ===
          activeTab === "code"
            ? h(
                "div",
                { style: { display: "flex", gap: "24px", width: "100%", maxWidth: "1200px" } },
                // Left main section (File Tree & README)
                h(
                  "div",
                  {
                    style: {
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      minWidth: 0,
                    },
                  },
                  // Branch picker & Breadcrumb bar
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "8px",
                      },
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "10px" } },
                      h(
                        "div",
                        { style: { position: "relative" } },
                        h(
                          "button",
                          {
                            type: "button",
                            onClick: function () {
                              setBranchPickerOpen(!isBranchPickerOpen);
                            },
                            style: {
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              height: "28px",
                              padding: "0 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--dsw-alias-border-l1)",
                              background: "var(--dsw-alias-surface-l1)",
                              color: "var(--dsw-alias-label-primary)",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            },
                          },
                          "⎇ " + curBranch + " ▾",
                        ),
                        isBranchPickerOpen
                          ? h(
                              "div",
                              {
                                style: {
                                  position: "absolute",
                                  top: "34px",
                                  left: 0,
                                  width: "240px",
                                  borderRadius: "8px",
                                  background: "var(--dsw-alias-surface-l1, #181926)",
                                  border: "1px solid var(--dsw-alias-border-l1)",
                                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                  zIndex: 100,
                                  padding: "8px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "6px",
                                },
                              },
                              h("input", {
                                type: "text",
                                placeholder: "Filter branches…",
                                value: branchSearch,
                                onChange: function (e) {
                                  setBranchSearch(e.target.value);
                                },
                                style: {
                                  width: "100%",
                                  boxSizing: "border-box",
                                  padding: "5px 8px",
                                  borderRadius: "5px",
                                  border: "1px solid var(--dsw-alias-border-l1)",
                                  background: "var(--dsw-alias-surface-l0)",
                                  color: "var(--dsw-alias-label-primary)",
                                  fontSize: "12px",
                                  outline: "none",
                                },
                              }),
                              h(
                                "div",
                                {
                                  style: {
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  },
                                },
                                branches
                                  .filter(function (b) {
                                    return (
                                      !branchSearch ||
                                      b.name.toLowerCase().indexOf(branchSearch.toLowerCase()) !==
                                        -1
                                    );
                                  })
                                  .map(function (b) {
                                    return h(
                                      "button",
                                      {
                                        key: b.name,
                                        type: "button",
                                        onClick: function () {
                                          handleSwitchBranch(b.name, false);
                                        },
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "6px 8px",
                                          borderRadius: "4px",
                                          border: "none",
                                          background: b.isCurrent
                                            ? "rgba(99, 102, 241, 0.15)"
                                            : "transparent",
                                          color: b.isCurrent
                                            ? "var(--dsw-alias-primary, #6366f1)"
                                            : "var(--dsw-alias-label-primary)",
                                          fontSize: "12px",
                                          fontWeight: b.isCurrent ? 600 : 400,
                                          cursor: "pointer",
                                          textAlign: "left",
                                        },
                                      },
                                      h("span", null, b.name),
                                      b.isCurrent
                                        ? h("span", { style: { fontSize: "10px" } }, "✓")
                                        : null,
                                    );
                                  }),
                              ),
                              h(
                                "button",
                                {
                                  type: "button",
                                  onClick: handleCreateNewBranch,
                                  style: {
                                    marginTop: "4px",
                                    padding: "5px 8px",
                                    borderRadius: "5px",
                                    border: "1px dashed var(--dsw-alias-border-l1)",
                                    background: "transparent",
                                    color: "var(--dsw-alias-primary, #6366f1)",
                                    fontSize: "11.5px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  },
                                },
                                "+ New branch",
                              ),
                            )
                          : null,
                      ),
                      // Breadcrumb directory navigation
                      h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "13px",
                          },
                        },
                        h(
                          "span",
                          {
                            style: {
                              color: "var(--dsw-alias-primary, #6366f1)",
                              cursor: "pointer",
                              fontWeight: 600,
                            },
                            onClick: function () {
                              handleNavigateSubPath("");
                            },
                          },
                          repoName,
                        ),
                        subPath
                          ? subPath.split("/").map(function (segment, sIdx, sArr) {
                              var accPath = sArr.slice(0, sIdx + 1).join("/");
                              return h(
                                React.Fragment,
                                { key: accPath },
                                h(
                                  "span",
                                  { style: { color: "var(--dsw-alias-label-tertiary)" } },
                                  "/",
                                ),
                                h(
                                  "span",
                                  {
                                    style: {
                                      color:
                                        sIdx === sArr.length - 1
                                          ? "var(--dsw-alias-label-primary)"
                                          : "var(--dsw-alias-primary, #6366f1)",
                                      cursor: "pointer",
                                      fontWeight: sIdx === sArr.length - 1 ? 600 : 400,
                                    },
                                    onClick: function () {
                                      handleNavigateSubPath(accPath);
                                    },
                                  },
                                  segment,
                                ),
                              );
                            })
                          : null,
                      ),
                    ),
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          fontSize: "12px",
                          color: "var(--dsw-alias-label-secondary)",
                        },
                      },
                      overview
                        ? h(
                            "span",
                            {
                              style: {
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              },
                              onClick: function () {
                                setActiveTab("history");
                              },
                            },
                            h(
                              "strong",
                              { style: { color: "var(--dsw-alias-label-primary)" } },
                              overview.totalCommits,
                            ),
                            " commits",
                          )
                        : null,
                      overview
                        ? h(
                            "span",
                            {
                              style: {
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              },
                              onClick: function () {
                                setActiveTab("branches");
                              },
                            },
                            h(
                              "strong",
                              { style: { color: "var(--dsw-alias-label-primary)" } },
                              overview.branchesCount,
                            ),
                            " branches",
                          )
                        : null,
                    ),
                  ),

                  // Latest Commit Banner (GitHub style)
                  overview && overview.latestCommit && overview.latestCommit.sha
                    ? h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            borderRadius: "8px 8px 0 0",
                            background: "var(--dsw-alias-surface-l1, #181926)",
                            border: "1px solid var(--dsw-alias-border-l1)",
                            borderBottom: "none",
                            fontSize: "12.5px",
                          },
                        },
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              minWidth: 0,
                            },
                          },
                          h(
                            "div",
                            {
                              style: {
                                width: "22px",
                                height: "22px",
                                borderRadius: "50%",
                                background: "var(--dsw-alias-primary, #6366f1)",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "11px",
                                fontWeight: 700,
                                flexShrink: 0,
                              },
                            },
                            overview.latestCommit.author
                              ? overview.latestCommit.author[0].toUpperCase()
                              : "G",
                          ),
                          h(
                            "strong",
                            { style: { color: "var(--dsw-alias-label-primary)", flexShrink: 0 } },
                            overview.latestCommit.author,
                          ),
                          h(
                            "span",
                            {
                              style: {
                                color: "var(--dsw-alias-label-primary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              },
                              title: overview.latestCommit.message,
                            },
                            overview.latestCommit.message,
                          ),
                        ),
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexShrink: 0,
                            },
                          },
                          h(
                            "span",
                            {
                              style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11px" },
                            },
                            overview.latestCommit.date,
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              onClick: function () {
                                if (navigator.clipboard)
                                  navigator.clipboard.writeText(overview.latestCommit.sha);
                                alert("Copied commit SHA: " + overview.latestCommit.sha);
                              },
                              style: {
                                padding: "2px 7px",
                                borderRadius: "5px",
                                border: "1px solid var(--dsw-alias-border-l1)",
                                background: "rgba(99, 102, 241, 0.1)",
                                color: "var(--dsw-alias-primary, #6366f1)",
                                fontFamily: "var(--ds-font-mono, monospace)",
                                fontSize: "11px",
                                fontWeight: 600,
                                cursor: "pointer",
                              },
                            },
                            overview.latestCommit.shortSha || overview.latestCommit.sha.slice(0, 7),
                          ),
                        ),
                      )
                    : null,

                  // File Tree Table (GitHub style)
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        borderRadius:
                          overview && overview.latestCommit && overview.latestCommit.sha
                            ? "0 0 8px 8px"
                            : "8px",
                        border: "1px solid var(--dsw-alias-border-l1)",
                        overflow: "hidden",
                        background: "var(--dsw-alias-surface-l0, #13141f)",
                      },
                    },
                    // Go to parent directory if in subpath
                    subPath
                      ? h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              padding: "8px 14px",
                              borderBottom:
                                "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                              cursor: "pointer",
                              background: "var(--dsw-alias-surface-l1, #181926)",
                              fontSize: "12.5px",
                              color: "var(--dsw-alias-primary, #6366f1)",
                              fontWeight: 600,
                            },
                            onClick: function () {
                              var parts = subPath.split("/");
                              parts.pop();
                              handleNavigateSubPath(parts.join("/"));
                            },
                          },
                          "📁 .. (parent directory)",
                        )
                      : null,
                    // Tree rows
                    overview && overview.tree && overview.tree.length > 0
                      ? overview.tree.map(function (item) {
                          var isDir = item.type === "tree";
                          return h(
                            "div",
                            {
                              key: item.path,
                              style: {
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 14px",
                                borderBottom:
                                  "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.08))",
                                fontSize: "12.5px",
                                transition: "background 100ms",
                              },
                              onMouseEnter: function (e) {
                                e.currentTarget.style.background =
                                  "var(--dsw-alias-surface-l1, rgba(128,128,128,0.06))";
                              },
                              onMouseLeave: function (e) {
                                e.currentTarget.style.background = "transparent";
                              },
                            },
                            // Name & icon
                            h(
                              "div",
                              {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  width: "35%",
                                  minWidth: 0,
                                  cursor: "pointer",
                                },
                                onClick: function () {
                                  if (isDir) {
                                    handleNavigateSubPath(item.relPath);
                                  } else {
                                    window.dispatchEvent(
                                      new CustomEvent("dsh:open-file-tab", {
                                        detail: {
                                          id: "file::" + item.path,
                                          type: "file",
                                          title: item.name,
                                          path: item.path,
                                        },
                                      }),
                                    );
                                  }
                                },
                              },
                              h(
                                "span",
                                {
                                  style: {
                                    color: isDir
                                      ? "var(--dsw-alias-primary, #6366f1)"
                                      : "var(--dsw-alias-label-tertiary)",
                                    display: "inline-flex",
                                  },
                                },
                                isDir
                                  ? h(FolderOpenGlyph, { size: 15 })
                                  : h(FileGlyph, { size: 15 }),
                              ),
                              h(
                                "span",
                                {
                                  style: {
                                    color: isDir
                                      ? "var(--dsw-alias-label-primary)"
                                      : "var(--dsw-alias-label-primary)",
                                    fontWeight: isDir ? 500 : 400,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  },
                                },
                                item.name,
                              ),
                            ),
                            // Last commit message
                            h(
                              "span",
                              {
                                style: {
                                  flex: 1,
                                  padding: "0 12px",
                                  color: "var(--dsw-alias-label-tertiary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontSize: "12px",
                                },
                                title: item.lastCommitMsg,
                              },
                              item.lastCommitMsg,
                            ),
                            // Last commit time
                            h(
                              "span",
                              {
                                style: {
                                  width: "90px",
                                  textAlign: "right",
                                  color: "var(--dsw-alias-label-tertiary)",
                                  fontSize: "11px",
                                  flexShrink: 0,
                                },
                              },
                              item.lastCommitDate,
                            ),
                          );
                        })
                      : h(
                          "div",
                          {
                            style: {
                              padding: "16px",
                              color: "var(--dsw-alias-label-tertiary)",
                              fontSize: "12px",
                            },
                          },
                          "Loading file tree…",
                        ),
                  ),

                  // README.md Rendered Markdown Section
                  overview && overview.readme
                    ? h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            borderRadius: "8px",
                            border: "1px solid var(--dsw-alias-border-l1)",
                            overflow: "hidden",
                            background: "var(--dsw-alias-surface-l0, #13141f)",
                            marginTop: "8px",
                          },
                        },
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "10px 16px",
                              background: "var(--dsw-alias-surface-l1, #181926)",
                              borderBottom: "1px solid var(--dsw-alias-border-l1)",
                              fontSize: "13px",
                              fontWeight: 600,
                            },
                          },
                          h(
                            "span",
                            { style: { color: "var(--dsw-alias-primary, #6366f1)" } },
                            "📖",
                          ),
                          h("span", null, overview.readme.name),
                        ),
                        h(
                          "div",
                          {
                            style: {
                              padding: "20px 24px",
                              fontSize: "13.5px",
                              lineHeight: "1.7",
                              color: "var(--dsw-alias-label-primary)",
                              whiteSpace: "pre-wrap",
                              fontFamily: "var(--ds-font-sans, system-ui, sans-serif)",
                              maxHeight: "450px",
                              overflowY: "auto",
                            },
                          },
                          overview.readme.content,
                        ),
                      )
                    : null,
                ),

                // Right Sidebar (About, Releases, Languages)
                h(
                  "div",
                  {
                    style: {
                      width: "280px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                      flexShrink: 0,
                    },
                  },
                  // About Box
                  h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                    h(
                      "h4",
                      {
                        style: {
                          margin: 0,
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      "About",
                    ),
                    h(
                      "p",
                      {
                        style: {
                          margin: 0,
                          fontSize: "12.5px",
                          color: "var(--dsw-alias-label-secondary)",
                          lineHeight: "1.5",
                        },
                      },
                      repoDisplayName + " — personal agent stack plugin workspace.",
                    ),
                    remoteUrl
                      ? h(
                          "a",
                          {
                            href: remoteUrl,
                            target: "_blank",
                            rel: "noreferrer",
                            style: {
                              fontSize: "12px",
                              color: "var(--dsw-alias-primary, #6366f1)",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            },
                          },
                          "🔗 " + remoteUrl.replace(/^https?:\/\//, ""),
                        )
                      : null,
                  ),

                  // Releases Box
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                        paddingTop: "14px",
                      },
                    },
                    h(
                      "h4",
                      {
                        style: {
                          margin: 0,
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      "Releases",
                    ),
                    h(
                      "span",
                      { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" } },
                      overview && overview.tagsCount > 0
                        ? overview.tagsCount + " tags published"
                        : "No releases published",
                    ),
                  ),

                  // Languages Box
                  overview && overview.languages && overview.languages.length > 0
                    ? h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            borderTop:
                              "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                            paddingTop: "14px",
                          },
                        },
                        h(
                          "h4",
                          {
                            style: {
                              margin: 0,
                              fontSize: "14px",
                              fontWeight: 600,
                              color: "var(--dsw-alias-label-primary)",
                            },
                          },
                          "Languages",
                        ),
                        // Multi-colored progress bar
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              height: "8px",
                              borderRadius: "4px",
                              overflow: "hidden",
                              width: "100%",
                              background: "var(--dsw-alias-surface-l1)",
                            },
                          },
                          overview.languages.map(function (lang) {
                            return h("div", {
                              key: lang.name,
                              style: {
                                width: lang.percent + "%",
                                background: lang.color,
                                height: "100%",
                              },
                              title: lang.name + " " + lang.percent + "%",
                            });
                          }),
                        ),
                        // Language badges list
                        h(
                          "div",
                          { style: { display: "flex", flexWrap: "wrap", gap: "10px" } },
                          overview.languages.map(function (lang) {
                            return h(
                              "div",
                              {
                                key: lang.name,
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  fontSize: "12px",
                                },
                              },
                              h("span", {
                                style: {
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background: lang.color,
                                },
                              }),
                              h(
                                "strong",
                                { style: { color: "var(--dsw-alias-label-primary)" } },
                                lang.name,
                              ),
                              h(
                                "span",
                                { style: { color: "var(--dsw-alias-label-tertiary)" } },
                                lang.percent + "%",
                              ),
                            );
                          }),
                        ),
                      )
                    : null,
                ),
              )
            : null,

          // === TAB: CHANGES / PULL REQUESTS & UNIFIED DIFF VIEWER ===
          activeTab === "changes"
            ? h(
                "div",
                { style: { display: "flex", gap: "20px", width: "100%", maxWidth: "1200px" } },
                // Left column: commit form & changed files list
                h(
                  "div",
                  {
                    style: {
                      width: "340px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                      flexShrink: 0,
                    },
                  },
                  // Commit box
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "14px",
                        borderRadius: "8px",
                        background: "var(--dsw-alias-surface-l1, #181926)",
                        border: "1px solid var(--dsw-alias-border-l1)",
                      },
                    },
                    h(
                      "strong",
                      { style: { fontSize: "13px", color: "var(--dsw-alias-label-primary)" } },
                      "Commit changes",
                    ),
                    h("textarea", {
                      placeholder: "Commit message (e.g. feat: implement repository overview)",
                      value: commitMsg,
                      rows: 3,
                      onChange: function (e) {
                        setCommitMsg(e.target.value);
                      },
                      onKeyDown: function (e) {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommitAndPush();
                      },
                      style: {
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid var(--dsw-alias-border-l1)",
                        background: "var(--dsw-alias-surface-l0, #13141f)",
                        color: "var(--dsw-alias-label-primary)",
                        fontSize: "12.5px",
                        outline: "none",
                        resize: "none",
                      },
                    }),
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        },
                      },
                      actionStatus
                        ? h(
                            "span",
                            {
                              style: {
                                fontSize: "11.5px",
                                color: "var(--dsw-alias-primary, #6366f1)",
                              },
                            },
                            actionStatus,
                          )
                        : h("span", null),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: handleCommitAndPush,
                          disabled: !commitMsg.trim(),
                          style: {
                            height: "28px",
                            padding: "0 14px",
                            borderRadius: "6px",
                            border: "none",
                            background: "var(--dsw-alias-primary, #6366f1)",
                            color: "#fff",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            cursor: commitMsg.trim() ? "pointer" : "default",
                            opacity: commitMsg.trim() ? 1 : 0.5,
                          },
                        },
                        "Commit & Push (⌘Enter)",
                      ),
                    ),
                  ),

                  // Actions: Stash & Discard
                  h(
                    "div",
                    { style: { display: "flex", gap: "8px" } },
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: handleStashChanges,
                        style: {
                          flex: 1,
                          height: "26px",
                          borderRadius: "6px",
                          border: "1px solid var(--dsw-alias-border-l1)",
                          background: "transparent",
                          color: "var(--dsw-alias-label-secondary)",
                          fontSize: "12px",
                          cursor: "pointer",
                        },
                      },
                      "Stash All",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: function () {
                          handleDiscardChanges();
                        },
                        style: {
                          flex: 1,
                          height: "26px",
                          borderRadius: "6px",
                          border: "1px solid var(--dsw-alias-border-l1)",
                          background: "transparent",
                          color: "var(--dsw-alias-state-error-primary, #f85149)",
                          fontSize: "12px",
                          cursor: "pointer",
                        },
                      },
                      "Discard All",
                    ),
                  ),

                  // Changed files list
                  h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      "Changed Files (" + (status.files ? status.files.length : 0) + "):",
                    ),
                    !status.files || status.files.length === 0
                      ? h(
                          "div",
                          {
                            style: {
                              color: "var(--dsw-alias-label-tertiary)",
                              fontSize: "12px",
                              padding: "8px 0",
                            },
                          },
                          "Working tree clean — no unstaged changes.",
                        )
                      : status.files.map(function (f) {
                          var isSel = selectedDiffFile === f.path;
                          return h(
                            "div",
                            {
                              key: f.path,
                              onClick: function () {
                                setSelectedDiffFile(isSel ? null : f.path);
                              },
                              style: {
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                background: isSel
                                  ? "rgba(99, 102, 241, 0.15)"
                                  : "var(--dsw-alias-surface-l1, #181926)",
                                border:
                                  "1px solid " +
                                  (isSel
                                    ? "var(--dsw-alias-primary, #6366f1)"
                                    : "var(--dsw-alias-border-l1, rgba(128,128,128,0.1))"),
                                fontSize: "12px",
                                cursor: "pointer",
                              },
                            },
                            h(
                              "span",
                              {
                                style: {
                                  color: isSel
                                    ? "var(--dsw-alias-primary, #6366f1)"
                                    : "var(--dsw-alias-label-primary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontFamily: "var(--ds-font-mono, monospace)",
                                },
                              },
                              f.path,
                            ),
                            h(
                              "span",
                              {
                                style: {
                                  fontSize: "10.5px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background:
                                    f.status === "added"
                                      ? "rgba(34, 197, 94, 0.2)"
                                      : f.status === "untracked"
                                        ? "rgba(59, 130, 246, 0.2)"
                                        : "rgba(234, 179, 8, 0.2)",
                                  color:
                                    f.status === "added"
                                      ? "#22c55e"
                                      : f.status === "untracked"
                                        ? "#3b82f6"
                                        : "#eab308",
                                  fontWeight: 600,
                                  marginLeft: "6px",
                                  flexShrink: 0,
                                },
                              },
                              f.status,
                            ),
                          );
                        }),
                  ),
                ),

                // Right column: Full Unified Diff Viewer
                h(
                  "div",
                  {
                    style: {
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                      border: "1px solid var(--dsw-alias-border-l1)",
                      borderRadius: "8px",
                      overflow: "hidden",
                      background: "var(--dsw-alias-surface-l0)",
                    },
                  },
                  h(
                    "div",
                    {
                      style: {
                        padding: "8px 14px",
                        background: "var(--dsw-alias-surface-l1, #181926)",
                        borderBottom: "1px solid var(--dsw-alias-border-l1)",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      },
                    },
                    h(
                      "span",
                      null,
                      selectedDiffFile ? "Diff: " + selectedDiffFile : "Working Tree Diff",
                    ),
                    selectedDiffFile
                      ? h(
                          "button",
                          {
                            type: "button",
                            onClick: function () {
                              setSelectedDiffFile(null);
                            },
                            style: {
                              background: "transparent",
                              border: "none",
                              color: "var(--dsw-alias-primary, #6366f1)",
                              fontSize: "11.5px",
                              cursor: "pointer",
                            },
                          },
                          "Show all diffs",
                        )
                      : null,
                  ),
                  h(
                    "div",
                    {
                      style: {
                        flex: 1,
                        padding: "12px",
                        fontFamily: "var(--ds-font-mono, monospace)",
                        fontSize: "12px",
                        lineHeight: "1.6",
                        overflowY: "auto",
                        maxHeight: "650px",
                      },
                    },
                    !diffText
                      ? h(
                          "div",
                          { style: { color: "var(--dsw-alias-label-tertiary)", padding: "16px" } },
                          "No diffs to display.",
                        )
                      : diffText.split("\n").map(function (line, lIdx) {
                          var isAdd = line.startsWith("+") && !line.startsWith("+++");
                          var isDel = line.startsWith("-") && !line.startsWith("---");
                          var isHunk = line.startsWith("@@");
                          return h(
                            "div",
                            {
                              key: lIdx,
                              style: {
                                padding: "1px 6px",
                                background: isAdd
                                  ? "rgba(34, 197, 94, 0.15)"
                                  : isDel
                                    ? "rgba(239, 68, 68, 0.15)"
                                    : isHunk
                                      ? "rgba(99, 102, 241, 0.12)"
                                      : "transparent",
                                color: isAdd
                                  ? "#4ade80"
                                  : isDel
                                    ? "#f87171"
                                    : isHunk
                                      ? "var(--dsw-alias-primary, #6366f1)"
                                      : "var(--dsw-alias-label-primary)",
                                whiteSpace: "pre",
                              },
                            },
                            line,
                          );
                        }),
                  ),
                ),
              )
            : null,

          // === TAB: COMMITS (DATE-GROUPED COMMIT HISTORY) ===
          activeTab === "history"
            ? h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    maxWidth: "900px",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    },
                  },
                  h(
                    "strong",
                    { style: { fontSize: "14px", color: "var(--dsw-alias-label-primary)" } },
                    "Commit History (" + log.length + ")",
                  ),
                  h(
                    "span",
                    { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" } },
                    "branch: " + curBranch,
                  ),
                ),
                log.map(function (c) {
                  return h(
                    "div",
                    {
                      key: c.fullSha || c.sha,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "6px",
                        background: "var(--dsw-alias-surface-l1, #181926)",
                        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.12))",
                      },
                    },
                    h(
                      "div",
                      {
                        style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
                      },
                      h(
                        "div",
                        {
                          style: {
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: "rgba(99, 102, 241, 0.2)",
                            color: "var(--dsw-alias-primary, #6366f1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            fontWeight: 700,
                            flexShrink: 0,
                          },
                        },
                        c.author ? c.author[0].toUpperCase() : "C",
                      ),
                      h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            minWidth: 0,
                          },
                        },
                        h(
                          "span",
                          {
                            style: {
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "var(--dsw-alias-label-primary)",
                            },
                          },
                          c.message,
                        ),
                        h(
                          "span",
                          { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } },
                          c.author + " committed " + c.date,
                        ),
                      ),
                    ),
                    h(
                      "div",
                      {
                        style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 },
                      },
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: function () {
                            if (navigator.clipboard)
                              navigator.clipboard.writeText(c.fullSha || c.sha);
                            alert("Copied SHA: " + (c.fullSha || c.sha));
                          },
                          style: {
                            fontFamily: "var(--ds-font-mono, monospace)",
                            fontSize: "11.5px",
                            color: "var(--dsw-alias-primary, #6366f1)",
                            fontWeight: 600,
                            background: "rgba(99, 102, 241, 0.1)",
                            border: "1px solid var(--dsw-alias-border-l1)",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          },
                        },
                        c.sha,
                      ),
                    ),
                  );
                }),
              )
            : null,

          // === TAB: BRANCHES ===
          activeTab === "branches"
            ? h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    maxWidth: "700px",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                  },
                  h(
                    "strong",
                    { style: { fontSize: "14px", color: "var(--dsw-alias-label-primary)" } },
                    "Branches (" + branches.length + ")",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: handleCreateNewBranch,
                      style: {
                        height: "26px",
                        padding: "0 12px",
                        borderRadius: "6px",
                        border: "none",
                        background: "var(--dsw-alias-primary, #6366f1)",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      },
                    },
                    "+ New Branch",
                  ),
                ),
                branches.map(function (b) {
                  return h(
                    "div",
                    {
                      key: b.name,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: "6px",
                        background: b.isCurrent
                          ? "rgba(99, 102, 241, 0.12)"
                          : "var(--dsw-alias-surface-l1, #181926)",
                        border: b.isCurrent
                          ? "1px solid var(--dsw-alias-primary, #6366f1)"
                          : "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                      },
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "8px" } },
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "13px",
                            fontWeight: b.isCurrent ? 600 : 400,
                            color: b.isCurrent
                              ? "var(--dsw-alias-primary, #6366f1)"
                              : "var(--dsw-alias-label-primary)",
                          },
                        },
                        (b.isCurrent ? "● " : "  ") + b.name,
                      ),
                      b.isCurrent
                        ? h(
                            "span",
                            {
                              style: {
                                fontSize: "11px",
                                color: "var(--dsw-alias-primary, #6366f1)",
                                fontWeight: 600,
                                background: "rgba(99, 102, 241, 0.2)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              },
                            },
                            "Default / Active",
                          )
                        : null,
                    ),
                    !b.isCurrent
                      ? h(
                          "button",
                          {
                            type: "button",
                            onClick: function () {
                              handleSwitchBranch(b.name, false);
                            },
                            style: {
                              height: "24px",
                              padding: "0 10px",
                              borderRadius: "4px",
                              border: "1px solid var(--dsw-alias-border-l1)",
                              background: "transparent",
                              color: "var(--dsw-alias-label-secondary)",
                              fontSize: "11.5px",
                              cursor: "pointer",
                            },
                          },
                          "Checkout",
                        )
                      : null,
                  );
                }),
              )
            : null,
        ),
      );
    }

    // Main-area tab bar: see client-main-area-tab-bar.js (prepended to this
    // bundle at build time).
    var TopConversationTabBar = __dshCreateMainAreaTabBar({
      React: React,
      h: h,
      tabMove: tabMove,
      tabMoveMenu: tabMoveMenu,
      tabTypeGlyph: tabTypeGlyph,
      useCenterBounds: useCenterBounds,
      ChatGlyph: ChatGlyph,
      PanelBottomGlyph: PanelBottomGlyph,
      PanelRightGlyph: PanelRightGlyph,
      EllipsisGlyph: EllipsisGlyph,
      FolderOpenGlyph: FolderOpenGlyph,
      TrashGlyph: TrashGlyph,
      SelectDropdownMenu: SelectDropdownMenu,
      EmptyAreaNewTabPicker: EmptyAreaNewTabPicker,
      MainViewTerminalOccupant: MainViewTerminalOccupant,
      MainViewContainerOccupant: MainViewContainerOccupant,
      MainViewFileEditorOccupant: MainViewFileEditorOccupant,
      MainViewRepoOccupant: MainViewRepoOccupant,
    });

    /** RenameTerminalModal implementation. */
    function RenameTerminalModal(props) {
      var oldName = props.oldName,
        onClose = props.onClose,
        onRenamed = props.onRenamed;
      var nameState = React.useState(oldName);
      var name = nameState[0],
        setName = nameState[1];
      var savingState = React.useState(false);
      var saving = savingState[0],
        setSaving = savingState[1];

      /**
       * Handles the renaming of a tab.
       *
       * Ensures the tab is renamed to the provided name and updates the UI state accordingly.
       * Returns nothing but updates the UI to reflect the new tab name.
       * Fails by reverting the tab name to its previous value and updating the UI to reflect the unchanged state.
       */
      var handleRename = function () {
        if (!name.trim()) return;
        setSaving(true);
        fetch(QUOTAS_API + "/tmux/sessions/rename", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ oldName: oldName, newName: name.trim() }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            if (res.ok) onRenamed();
            else alert("Failed to rename session: " + (res.error || "Unknown error"));
          })
          .catch(function (e) {
            alert("Error: " + e.message);
          })
          .finally(function () {
            setSaving(false);
            onClose();
          });
      };

      return h(
        "div",
        {
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
          },
        },
        h(
          "div",
          {
            style: {
              width: "360px",
              padding: "20px",
              borderRadius: "10px",
              background: "var(--dsw-alias-bg-layer-2, #1c2128)",
              border: "1px solid var(--dsw-alias-border-l1)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            },
          },
          h(
            "h3",
            { style: { margin: 0, fontSize: "15px", fontWeight: 600 } },
            "Rename Terminal Session",
          ),
          h("input", {
            type: "text",
            value: name,
            onChange: function (e) {
              setName(e.target.value);
            },
            onKeyDown: function (e) {
              if (e.key === "Enter") handleRename();
            },
            autoFocus: true,
            style: {
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--dsw-alias-border-l2)",
              background: "var(--dsw-alias-surface-l1)",
              color: "inherit",
              fontSize: "13px",
            },
          }),
          h(
            "div",
            {
              style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" },
            },
            h(
              "button",
              {
                onClick: onClose,
                style: {
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--dsw-alias-border-l2)",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                },
              },
              "Cancel",
            ),
            h(
              "button",
              {
                onClick: handleRename,
                disabled: saving,
                style: {
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background: "var(--dsw-alias-primary, #6366f1)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                },
              },
              saving ? "Saving…" : "Save",
            ),
          ),
        ),
      );
    }

    /**
     * Removes a terminal session from the tabs if found, and adjusts the active tab accordingly.
     * Guarantees that the session is removed if found, and sets the new active tab if the removed tab was active.
     * Returns the updated list of tabs.
     * Fails gracefully by setting the active tab to "chat-main" if no other tabs remain active.
     */
    var WorkspaceGlyph = createDecoratedGlyphComponent(
      15,
      "dsh-icon-workspace",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-info, #38bdf8)",
      },
      false,
      function () {
        return [
          h("rect", { x: "2", y: "7", width: "20", height: "14", rx: "2", ry: "2" }),
          h("path", { d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" }),
        ];
      },
    );

    /**
     * Focuses the application icon based on the current tab state.
     *
     * Guarantees that the application icon is updated to reflect the current active tab.
     * If the current tab is being removed, it selects the next available tab or defaults to "chat-main".
     * Fails gracefully by ensuring the application icon remains visible and functional.
     */
    function renderAppIcon(appName, size, filePath) {
      var s = size || 15;
      var raw = (appName || "").trim();
      var cleanName = raw.replace(/\.app$/i, "").trim();

      if (filePath) {
        return h("img", {
          src: "/quotas/api/fs/icon?path=" + encodeURIComponent(filePath),
          width: s,
          height: s,
          alt: appName,
          className: "dsh-icon-animated",
          style: {
            width: s + "px",
            height: s + "px",
            objectFit: "contain",
            display: "inline-flex",
            verticalAlign: "middle",
            flexShrink: 0,
            borderRadius: "3px",
          },
          onError: function (e) {
            e.target.style.display = "none";
          },
        });
      }

      if (raw.startsWith("/") && raw.includes(".app")) {
        return h("img", {
          src: "/quotas/api/fs/icon?path=" + encodeURIComponent(raw),
          width: s,
          height: s,
          alt: appName,
          className: "dsh-icon-animated",
          style: {
            width: s + "px",
            height: s + "px",
            objectFit: "contain",
            display: "inline-flex",
            verticalAlign: "middle",
            flexShrink: 0,
            borderRadius: "3px",
          },
          onError: function (e) {
            e.target.style.display = "none";
          },
        });
      }

      if (cleanName) {
        var resolvedPath = "/Applications/" + cleanName + ".app";
        return h("img", {
          src: "/quotas/api/fs/icon?path=" + encodeURIComponent(resolvedPath),
          width: s,
          height: s,
          alt: appName,
          className: "dsh-icon-animated",
          style: {
            width: s + "px",
            height: s + "px",
            objectFit: "contain",
            display: "inline-flex",
            verticalAlign: "middle",
            flexShrink: 0,
            borderRadius: "3px",
          },
          onError: function (e) {
            e.target.style.display = "none";
          },
        });
      }

      return null;
    }

    /** AppGlyph implementation. */
    function AppGlyph(props) {
      return renderAppIcon(
        props && props.appName ? props.appName : "app",
        props && props.size ? props.size : 14,
      );
    }

    /** LibraryGlyph implementation. */
    var LibraryGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-library",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-label-tertiary)",
      },
      false,
      function () {
        return [
          h("path", { d: "m16 6 4 14" }),
          h("path", { d: "M12 6v14" }),
          h("path", { d: "M8 8v12" }),
          h("path", { d: "M4 4v16" }),
        ];
      },
    );

    /**
     * Checks if the active tab's text indicates a trajectory with changes.
     *
     * Returns true if the active tab's text is "trajectory" and does not start with "+++" or "---",
     * otherwise returns false.
     *
     * @returns {boolean} - true if the active tab's text is "trajectory" and not marked as unchanged, false otherwise.
     */
    var SystemGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-system",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-label-tertiary)",
      },
      false,
      function () {
        return [
          h("rect", { width: "16", height: "16", x: "4", y: "4", rx: "2" }),
          h("rect", { width: "6", height: "6", x: "9", y: "9", rx: "1" }),
          h("path", { d: "M15 2v2" }),
          h("path", { d: "M15 20v2" }),
          h("path", { d: "M2 15h2" }),
          h("path", { d: "M2 9h2" }),
          h("path", { d: "M20 15h2" }),
          h("path", { d: "M20 9h2" }),
          h("path", { d: "M9 2v2" }),
          h("path", { d: "M9 20v2" }),
        ];
      },
    );

    /** UsersGlyph implementation. */
    var UsersGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-users",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-label-tertiary)",
      },
      false,
      function () {
        return [
          h("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }),
          h("circle", { cx: "9", cy: "7", r: "4" }),
          h("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }),
          h("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }),
        ];
      },
    );

    /**
     * Toggles the view to either "chat" or "trajectory" based on the active tab.
     * Fails silently if the active tab is not recognized or does not match the expected names.
     * Returns nothing but changes the active tab if found.
     */
    var ArchiveBoxGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-archive",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [
          h("rect", { width: "20", height: "5", x: "2", y: "3", rx: "1" }),
          h("path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }),
          h("path", { d: "M10 12h4" }),
        ];
      },
    );

    /**
     * Interacts with the UI to select a target tab based on the given target name and type.
     *
     * Guarantees that the target tab is selected if it matches the criteria for "trajectory" or "轨迹".
     * Fails by selecting the first inactive tab if no matching target is found.
     */
    var RestoreGlyph = createDecoratedGlyphComponent(
      13,
      "dsh-icon-refresh",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
      },
      false,
      function () {
        return [
          h("polyline", { points: "1 4 1 10 7 10" }),
          h("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" }),
        ];
      },
    );

    /** BlueFolderGlyph implementation. */
    var BlueFolderGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-folder",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [
          h("path", {
            d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
          }),
        ];
      },
    );

    /**
     * Downloads the active session as a JSONL file if the active tab is a terminal, container, file, or repository.
     * Fallbacks to no operation if the active tab is empty or not one of the supported types.
     * @returns {void}
     */
    var FolderPlusGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-folder-plus",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
      },
      true,
      function () {
        return [
          h("path", {
            d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
          }),
          h("line", { x1: "12", y1: "10", x2: "12", y2: "16" }),
          h("line", { x1: "9", y1: "13", x2: "15", y2: "13" }),
        ];
      },
    );

    /**
     * Renders a div element with specific styles and classes representing the top conversation header.
     * The header is fixed at the top with a background color and border, and is centered horizontally.
     * It uses the `h` function to create the div element.
     *
     * @returns {JSX.Element} A JSX element representing the top conversation header.
     */
    var SlidersGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-sliders",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
      },
      true,
      function () {
        return [
          h("line", { x1: "4", y1: "21", x2: "4", y2: "14" }),
          h("line", { x1: "4", y1: "10", x2: "4", y2: "3" }),
          h("line", { x1: "12", y1: "21", x2: "12", y2: "12" }),
          h("line", { x1: "12", y1: "8", x2: "12", y2: "3" }),
          h("line", { x1: "20", y1: "21", x2: "20", y2: "16" }),
          h("line", { x1: "20", y1: "12", x2: "20", y2: "3" }),
          h("line", { x1: "1", y1: "14", x2: "7", y2: "14" }),
          h("line", { x1: "9", y1: "8", x2: "15", y2: "8" }),
          h("line", { x1: "17", y1: "16", x2: "23", y2: "16" }),
        ];
      },
    );

    /**
     * Handles the onDrop event for the top tab list, moving the selected tab to the top.
     *
     * Guarantees that the active tab is updated to the dropped tab's ID.
     *
     * @param {DragEvent} e - The drag event containing the dropped item.
     */
    var PinGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-pin",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [
          h("line", { x1: "12", x2: "12", y1: "17", y2: "22" }),
          h("path", {
            d: "M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z",
          }),
        ];
      },
    );

    /**
     * Displays a glyph representing the type of active tab.
     *
     * Guarantees a visual representation based on the tab type and highlights the selected tab.
     *
     * On context menu, opens a context menu for the tab.
     */
    var ActiveGlyph = createDecoratedGlyphComponent(
      14,
      "dsh-icon-active",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [h("path", { d: "M22 12h-4l-3 9L9 3l-3 9H2" })];
      },
    );

    /**
     * Represents a tab glyph in the host machine interface.
     *
     * This div element is draggable and clickable, changing its background color
     * when selected and triggering context menu on right-click.
     *
     * On click, the active tab is set. On drag start, data about the tab is
     * prepared for transfer. On context menu, the current context menu is updated
     * with the tab information and mouse position.
     */
    var HostMachineGlyph = createDecoratedGlyphComponent(
      15,
      "dsh-icon-system",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [
          h("rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }),
          h("line", { x1: "8", x2: "16", y1: "21", y2: "21" }),
          h("line", { x1: "12", x2: "12", y1: "17", y2: "21" }),
        ];
      },
    );

    /**
     * Represents a graphical element for a hard drive with visual styling based on selection state.
     *
     * The style of the glyph changes based on whether it is selected, affecting its background color, border, text color, and cursor.
     *
     * @param {boolean} isSel - Determines if the glyph is selected, affecting its visual appearance.
     */
    var HardDriveGlyph = createDecoratedGlyphComponent(
      15,
      "",
      {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-label-secondary, #94a3b8)",
      },
      false,
      function () {
        return [
          h("line", { x1: "22", x2: "2", y1: "12", y2: "12" }),
          h("path", {
            d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
          }),
          h("line", { x1: "6", x2: "6.01", y1: "16", y2: "16" }),
          h("line", { x1: "10", x2: "10.01", y1: "16", y2: "16" }),
        ];
      },
    );

    /** SparklesGlyph implementation. */
    var SparklesGlyph = createDecoratedGlyphComponent(
      14,
      "",
      {
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        color: "var(--dsw-alias-primary, #6366f1)",
      },
      false,
      function () {
        return [
          h("path", {
            d: "M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z",
          }),
        ];
      },
    );

    /**
     * Nav glyph for the consolidated "Providers" settings section (#237),
     * covering both the accounts/credentials and models sub-tabs.
     */
    var ProvidersGlyph = createGlyphComponent(16, "", false, false, false, function () {
      return [
        h("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
        h("circle", { cx: "12", cy: "7", r: "4" }),
      ];
    });

    /**
     * Sets the style and behavior for an AppsGlyph element, making it appear as a pointer
     * with specific styling and interactive behavior on mouse enter and leave events.
     *
     * On mouse enter, the glyph becomes fully opaque and changes color to #f85149.
     * On mouse leave, it reverts to its initial opacity and color.
     *
     * Returns the rendered AppsGlyph element or null if the condition for rendering is not met.
     */
    var AppsGlyph = createGlyphComponent(16, "", false, false, false, function () {
      return [
        h("rect", { x: "3", y: "3", width: "7", height: "7" }),
        h("rect", { x: "14", y: "3", width: "7", height: "7" }),
        h("rect", { x: "14", y: "14", width: "7", height: "7" }),
        h("rect", { x: "3", y: "14", width: "7", height: "7" }),
      ];
    });

    /** Shared 24x24 lucide-style icon SVG wrapper used by LUCIDE_ICONS_CATALOG entries. */
    function renderLucideSvg(s, c) {
      var children = Array.prototype.slice.call(arguments, 2);
      return h.apply(
        null,
        [
          "svg",
          {
            width: s,
            height: s,
            className: c,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          },
        ].concat(children),
      );
    }

    var LUCIDE_ICONS_CATALOG = {
      // System & OS
      Folder: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
            }),
          );
        },
      },
      FolderGit2: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
            }),
            h("circle", { cx: "12", cy: "13", r: "2" }),
          );
        },
      },
      HardDrive: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("line", { x1: "22", x2: "2", y1: "12", y2: "12" }),
            h("path", {
              d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
            }),
            h("line", { x1: "6", x2: "6.01", y1: "16", y2: "16" }),
            h("line", { x1: "10", x2: "10.01", y1: "16", y2: "16" }),
          );
        },
      },
      Server: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { width: "20", height: "8", x: "2", y: "2", rx: "2", ry: "2" }),
            h("rect", { width: "20", height: "8", x: "2", y: "14", rx: "2", ry: "2" }),
            h("line", { x1: "6", x2: "6.01", y1: "6", y2: "6" }),
            h("line", { x1: "6", x2: "6.01", y1: "18", y2: "18" }),
          );
        },
      },
      Cpu: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { width: "16", height: "16", x: "4", y: "4", rx: "2" }),
            h("rect", { width: "6", height: "6", x: "9", y: "9", rx: "1" }),
            h("path", { d: "M15 2v2" }),
            h("path", { d: "M15 20v2" }),
            h("path", { d: "M2 15h2" }),
            h("path", { d: "M2 9h2" }),
            h("path", { d: "M20 15h2" }),
            h("path", { d: "M20 9h2" }),
            h("path", { d: "M9 2v2" }),
            h("path", { d: "M9 20v2" }),
          );
        },
      },
      AppWindow: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { x: "2", y: "4", width: "20", height: "16", rx: "2" }),
            h("path", { d: "M10 4v4" }),
            h("path", { d: "M2 8h20" }),
            h("path", { d: "M6 4v4" }),
          );
        },
      },
      Library: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "m16 6 4 14" }),
            h("path", { d: "M12 6v14" }),
            h("path", { d: "M8 8v12" }),
            h("path", { d: "M4 4v16" }),
          );
        },
      },
      Users: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }),
            h("circle", { cx: "9", cy: "7", r: "4" }),
            h("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }),
            h("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }),
          );
        },
      },
      Archive: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { width: "20", height: "5", x: "2", y: "3", rx: "1" }),
            h("path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }),
            h("path", { d: "M10 12h4" }),
          );
        },
      },
      RotateCcw: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
            h("path", { d: "M3 3v5h5" }),
          );
        },
      },
      Pin: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("line", { x1: "12", x2: "12", y1: "17", y2: "22" }),
            h("path", {
              d: "M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z",
            }),
          );
        },
      },
      Activity: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(s, c, h("path", { d: "M22 12h-4l-3 9L9 3l-3 9H2" }));
        },
      },
      ShieldCheck: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
            h("path", { d: "m9 12 2 2 4-4" }),
          );
        },
      },
      KeyRound: {
        category: "System & OS",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" }),
            h("circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor" }),
          );
        },
      },

      // Development & Files
      Terminal: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("polyline", { points: "4 17 10 11 4 5" }),
            h("line", { x1: "12", x2: "20", y1: "19", y2: "19" }),
          );
        },
      },
      FileCode: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z",
            }),
            h("polyline", { points: "14 2 14 8 20 8" }),
            h("path", { d: "m10 13-2 2 2 2" }),
            h("path", { d: "m14 17 2-2-2-2" }),
          );
        },
      },
      Code: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("polyline", { points: "16 18 22 12 16 6" }),
            h("polyline", { points: "8 6 2 12 8 18" }),
          );
        },
      },
      FileText: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z",
            }),
            h("polyline", { points: "14 2 14 8 20 8" }),
            h("line", { x1: "16", x2: "8", y1: "13", y2: "13" }),
            h("line", { x1: "16", x2: "8", y1: "17", y2: "17" }),
            h("line", { x1: "10", x2: "8", y1: "9", y2: "9" }),
          );
        },
      },
      Database: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }),
            h("path", { d: "M3 5V19A9 3 0 0 0 21 19V5" }),
            h("path", { d: "M3 12A9 3 0 0 0 21 12" }),
          );
        },
      },
      Braces: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1",
            }),
            h("path", {
              d: "M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
            }),
          );
        },
      },
      Boxes: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
            }),
            h("path", {
              d: "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
            }),
            h("path", {
              d: "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
            }),
          );
        },
      },
      GitFork: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("circle", { cx: "12", cy: "18", r: "3" }),
            h("circle", { cx: "6", cy: "6", r: "3" }),
            h("circle", { cx: "18", cy: "6", r: "3" }),
            h("path", { d: "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" }),
            h("path", { d: "M12 12v3" }),
          );
        },
      },
      GitBranch: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("line", { x1: "6", x2: "6", y1: "3", y2: "15" }),
            h("circle", { cx: "18", cy: "6", r: "3" }),
            h("circle", { cx: "6", cy: "18", r: "3" }),
            h("path", { d: "M18 9a9 9 0 0 1-9 9" }),
          );
        },
      },
      Hammer: {
        category: "Development",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9",
            }),
            h("path", { d: "M17.64 15 22 10.64" }),
            h("path", {
              d: "m20.91 3.26-1.57-1.57a2.12 2.12 0 0 0-3 0l-5.63 5.63 4.57 4.57 5.63-5.63a2.12 2.12 0 0 0 0-3z",
            }),
          );
        },
      },

      // Agents & Modes
      Bot: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M12 8V4H8" }),
            h("rect", { width: "16", height: "12", x: "4", y: "8", rx: "2" }),
            h("path", { d: "M2 14h2" }),
            h("path", { d: "M20 14h2" }),
            h("path", { d: "M15 13v2" }),
            h("path", { d: "M9 13v2" }),
          );
        },
      },
      Brain: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04Z",
            }),
            h("path", {
              d: "M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04Z",
            }),
          );
        },
      },
      Sparkles: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z",
            }),
          );
        },
      },
      Calendar: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", ry: "2" }),
            h("line", { x1: "16", x2: "16", y1: "2", y2: "6" }),
            h("line", { x1: "8", x2: "8", y1: "2", y2: "6" }),
            h("line", { x1: "3", x2: "21", y1: "10", y2: "10" }),
          );
        },
      },
      PlayCircle: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("circle", { cx: "12", cy: "12", r: "10" }),
            h("polygon", { points: "10 8 16 12 10 16 10 8" }),
          );
        },
      },
      Network: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { x: "16", y: "16", width: "6", height: "6", rx: "1" }),
            h("rect", { x: "2", y: "16", width: "6", height: "6", rx: "1" }),
            h("rect", { x: "9", y: "2", width: "6", height: "6", rx: "1" }),
            h("path", { d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" }),
            h("path", { d: "M12 12V8" }),
          );
        },
      },
      CheckSquare: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("polyline", { points: "9 11 12 14 22 4" }),
            h("path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" }),
          );
        },
      },
      RefreshCw: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
            h("path", { d: "M21 3v5h-5" }),
            h("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
            h("path", { d: "M8 16H3v5" }),
          );
        },
      },
      Wrench: {
        category: "Agents & Roles",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", {
              d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
            }),
          );
        },
      },

      // UI & Media
      SlidersHorizontal: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("line", { x1: "21", x2: "14", y1: "4", y2: "4" }),
            h("line", { x1: "10", x2: "3", y1: "4", y2: "4" }),
            h("line", { x1: "21", x2: "12", y1: "12", y2: "12" }),
            h("line", { x1: "8", x2: "3", y1: "12", y2: "12" }),
            h("line", { x1: "21", x2: "16", y1: "20", y2: "20" }),
            h("line", { x1: "12", x2: "3", y1: "20", y2: "20" }),
            h("line", { x1: "14", x2: "14", y1: "2", y2: "6" }),
            h("line", { x1: "8", x2: "8", y1: "10", y2: "14" }),
            h("line", { x1: "16", x2: "16", y1: "18", y2: "22" }),
          );
        },
      },
      Palette: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }),
            h("circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor" }),
            h("circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }),
            h("circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }),
            h("path", {
              d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z",
            }),
          );
        },
      },
      MessageSquare: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }),
          );
        },
      },
      Image: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }),
            h("circle", { cx: "9", cy: "9", r: "2" }),
            h("path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }),
          );
        },
      },
      Globe: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("circle", { cx: "12", cy: "12", r: "10" }),
            h("line", { x1: "2", x2: "22", y1: "12", y2: "12" }),
            h("path", {
              d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
            }),
          );
        },
      },
      Compass: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("circle", { cx: "12", cy: "12", r: "10" }),
            h("polygon", { points: "16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" }),
          );
        },
      },
      Music: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M9 18V5l12-2v13" }),
            h("circle", { cx: "6", cy: "18", r: "3" }),
            h("circle", { cx: "18", cy: "16", r: "3" }),
          );
        },
      },
      Trash2: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M3 6h18" }),
            h("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }),
            h("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }),
            h("line", { x1: "10", x2: "10", y1: "11", y2: "17" }),
            h("line", { x1: "14", x2: "14", y1: "11", y2: "17" }),
          );
        },
      },
      Pencil: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }),
            h("path", { d: "m15 5 4 4" }),
          );
        },
      },
      Copy: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }),
            h("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }),
          );
        },
      },
      Scissors: {
        category: "UI & Media",
        render: function (s, c) {
          return renderLucideSvg(
            s,
            c,
            h("circle", { cx: "6", cy: "6", r: "3" }),
            h("circle", { cx: "6", cy: "18", r: "3" }),
            h("line", { x1: "20", x2: "8.12", y1: "4", y2: "15.88" }),
            h("line", { x1: "14.47", x2: "20", y1: "14.48", y2: "20" }),
            h("line", { x1: "8.12", x2: "12", y1: "8.12", y2: "12" }),
          );
        },
      },
    };

    /**
     * Renders a catalog icon with a specified set of SVG elements.
     *
     * Returns an SVG icon composed of geometric shapes.
     *
     * @returns {JSX.Element} The SVG representation of the catalog icon.
     */
    function renderCatalogIcon(iconName, size, className) {
      var s = size || 16;
      var c = (className ? className + " " : "") + "dsh-icon-animated";
      if (
        LUCIDE_ICONS_CATALOG[iconName] &&
        typeof LUCIDE_ICONS_CATALOG[iconName].render === "function"
      ) {
        return LUCIDE_ICONS_CATALOG[iconName].render(s, c);
      }
      return h(
        "svg",
        {
          width: s,
          height: s,
          className: c,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        },
        h("path", {
          d: "M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z",
        }),
      );
    }

    var DEFAULT_ICON_MAPPINGS = {
      extensions: {
        ".ts": "FileCode",
        ".tsx": "FileCode",
        ".js": "FileCode",
        ".jsx": "FileCode",
        ".py": "Code",
        ".json": "Braces",
        ".md": "FileText",
        ".rs": "Cpu",
        ".go": "Cpu",
        ".sh": "Terminal",
        ".sql": "Database",
        ".env": "KeyRound",
        ".yaml": "FileText",
        ".yml": "FileText",
        ".png": "Image",
        ".jpg": "Image",
        ".svg": "Sparkles",
      },
      folders: {
        Applications: "AppWindow",
        Library: "Library",
        System: "Cpu",
        Users: "Users",
        Projects: "GitFork",
        Archive: "Archive",
        Hosts: "Server",
        Drives: "HardDrive",
        Pinned: "Pin",
        Active: "Activity",
        Ungrouped: "Folder",
      },
      apps: {
        Terminal: "Terminal",
        Finder: "AppWindow",
        Docker: "Boxes",
        VSCode: "Code",
        Xcode: "Hammer",
        Chrome: "Globe",
        Safari: "Compass",
        Slack: "MessageSquare",
        Discord: "MessageSquare",
        Music: "Music",
        Spotify: "Music",
        Notes: "FileText",
        Settings: "SlidersHorizontal",
        GitHub: "GitFork",
      },
      agents: {
        Code: "Code",
        Planning: "Calendar",
        Reasoning: "Brain",
        Execution: "PlayCircle",
        Orchestration: "Network",
        Review: "CheckSquare",
        Reflection: "Sparkles",
        DarkFactory: "Bot",
      },
    };

    /**
     * Interacts with the UI to load custom icon mappings for a target tab.
     *
     * Guarantees that the target tab will be selected if it matches the criteria for "trajectory" or "轨迹".
     * Fails by selecting the first inactive tab if no matching target is found.
     */
    function loadCustomIconMappings() {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          var raw = window.localStorage.getItem("dsh_custom_icon_mappings");
          if (raw) {
            var parsed = JSON.parse(raw);
            return Object.assign({}, DEFAULT_ICON_MAPPINGS, parsed);
          }
        }
      } catch (e) {}
      return JSON.parse(JSON.stringify(DEFAULT_ICON_MAPPINGS));
    }

    /**
     * Sets custom icon mappings for the BlueFolderGlyph.
     *
     * This function returns an array of SVG elements representing the icon mappings.
     * It ensures the icon is displayed with the specified style and color.
     *
     * @returns {Array} An array of SVG elements defining the icon's appearance.
     */
    function saveCustomIconMappings(mappings) {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_custom_icon_mappings", JSON.stringify(mappings));
          window.dispatchEvent(new CustomEvent("dsh:icon-mappings-changed", { detail: mappings }));
        }
      } catch (e) {}
    }

    // Global resolver
    if (typeof window !== "undefined") {
      window.__dsh_get_icon_for__ = function (type, key) {
        var mappings = loadCustomIconMappings();
        var category = mappings && mappings[type];
        if (category && category[key]) return category[key];
        return null;
      };
    }

    /**
     * Creates a decorated glyph component for the "folder-plus" icon.
     * If the icon is used in the context of a supported tab type (terminal, container, file, or repository),
     * it displays the folder-plus icon with specified styles. Otherwise, it performs no operation.
     * @returns {void}
     */
    function IconsSection() {
      var mappingsState = React.useState(loadCustomIconMappings);
      var mappings = mappingsState[0],
        setMappings = mappingsState[1];

      var activeTabState = React.useState("catalog");
      var activeTab = activeTabState[0],
        setActiveTab = activeTabState[1];

      var activeMappingCategoryState = React.useState("extensions");
      var activeMappingCategory = activeMappingCategoryState[0],
        setActiveMappingCategory = activeMappingCategoryState[1];

      var searchState = React.useState("");
      var search = searchState[0],
        setSearch = searchState[1];

      var catalogCategoryState = React.useState("All");
      var catalogCategory = catalogCategoryState[0],
        setCatalogCategory = catalogCategoryState[1];

      var newTargetState = React.useState("");
      var newTarget = newTargetState[0],
        setNewTarget = newTargetState[1];

      var newIconState = React.useState("Sparkles");
      var newIcon = newIconState[0],
        setNewIcon = newIconState[1];

      var iconKeys = Object.keys(LUCIDE_ICONS_CATALOG);
      var filteredIcons = iconKeys.filter(function (k) {
        var matchCat =
          catalogCategory === "All" ||
          LUCIDE_ICONS_CATALOG[k].category.toLowerCase().includes(catalogCategory.toLowerCase());
        var matchSearch =
          !search ||
          k.toLowerCase().includes(search.toLowerCase()) ||
          LUCIDE_ICONS_CATALOG[k].category.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
      });

      /**
       * Handles the onDrop event for the top tab list, updating the active tab to the dropped tab's ID.
       *
       * Guarantees that the active tab is updated to the dropped tab's ID upon successful drop.
       *
       * @param {DragEvent} e - The drag event containing the dropped item.
       */
      var handleAddMapping = function () {
        if (!newTarget.trim()) return;
        var next = JSON.parse(JSON.stringify(mappings));
        if (!next[activeMappingCategory]) next[activeMappingCategory] = {};
        next[activeMappingCategory][newTarget.trim()] = newIcon;
        setMappings(next);
        saveCustomIconMappings(next);
        setNewTarget("");
      };

      var /** handleRemoveMapping implementation. */
        handleRemoveMapping = function (key) {
          var next = JSON.parse(JSON.stringify(mappings));
          if (next[activeMappingCategory] && next[activeMappingCategory][key]) {
            delete next[activeMappingCategory][key];
            setMappings(next);
            saveCustomIconMappings(next);
          }
        };

      /**
       * Displays a pin glyph icon.
       *
       * This function returns an array of SVG elements representing the pin icon.
       * It ensures the icon is displayed inline-flex with specified styles.
       *
       * @returns {Array} An array containing SVG line and path elements forming the pin icon.
       */
      var handleResetCategory = function () {
        var next = JSON.parse(JSON.stringify(mappings));
        next[activeMappingCategory] = Object.assign(
          {},
          DEFAULT_ICON_MAPPINGS[activeMappingCategory],
        );
        setMappings(next);
        saveCustomIconMappings(next);
      };

      /**
       * Handles the reset action for all components, updating their visual state.
       *
       * Guarantees that all components revert to their initial state and reset any active or highlighted conditions.
       *
       * On failure, no changes are made to the components' visual state.
       */
      var handleResetAll = function () {
        var next = JSON.parse(JSON.stringify(DEFAULT_ICON_MAPPINGS));
        setMappings(next);
        saveCustomIconMappings(next);
      };

      var currentCategoryMappings = (mappings && mappings[activeMappingCategory]) || {};
      var mappingKeys = Object.keys(currentCategoryMappings);

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "4px 0",
            maxWidth: "900px",
          },
        },
        // Header
        h(
          "div",
          {
            style: {
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            },
          },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px 0",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Icon Catalog & Custom Mappings",
            ),
            h(
              "div",
              { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Explore the library of animated Lucide icons and configure dynamic mappings for extensions, directories, applications, and agent roles.",
            ),
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: "6px",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.08))",
                padding: "3px",
                borderRadius: "8px",
                border: "1px solid var(--dsw-alias-border-l1)",
              },
            },
            h(
              "button",
              {
                type: "button",
                onClick: function () {
                  setActiveTab("catalog");
                },
                style: {
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    activeTab === "catalog" ? "var(--dsw-alias-surface-l2, #333)" : "transparent",
                  color:
                    activeTab === "catalog"
                      ? "var(--dsw-alias-label-primary)"
                      : "var(--dsw-alias-label-secondary)",
                  fontWeight: activeTab === "catalog" ? 600 : 400,
                  fontSize: "12px",
                  cursor: "pointer",
                },
              },
              "Icon Catalog (" + iconKeys.length + ")",
            ),
            h(
              "button",
              {
                type: "button",
                onClick: function () {
                  setActiveTab("mappings");
                },
                style: {
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    activeTab === "mappings" ? "var(--dsw-alias-surface-l2, #333)" : "transparent",
                  color:
                    activeTab === "mappings"
                      ? "var(--dsw-alias-label-primary)"
                      : "var(--dsw-alias-label-secondary)",
                  fontWeight: activeTab === "mappings" ? 600 : 400,
                  fontSize: "12px",
                  cursor: "pointer",
                },
              },
              "Custom Mappings",
            ),
          ),
        ),

        // Tab 1: Catalog
        activeTab === "catalog"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "16px" } },
              // Controls
              h(
                "div",
                { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } },
                h("input", {
                  type: "text",
                  placeholder: "Search icons by name or tag (e.g. folder, brain, docker)...",
                  value: search,
                  onChange: function (e) {
                    setSearch(e.target.value);
                  },
                  style: {
                    flex: "1 1 240px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l2)",
                    background: "var(--dsw-alias-surface-l1)",
                    color: "inherit",
                    fontSize: "13px",
                  },
                }),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                  ["All", "System", "Development", "Agents", "UI"].map(function (cat) {
                    return h(
                      "button",
                      {
                        key: cat,
                        type: "button",
                        onClick: function () {
                          setCatalogCategory(cat);
                        },
                        style: {
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border:
                            "1px solid " +
                            (catalogCategory === cat
                              ? "var(--dsw-alias-primary, #6366f1)"
                              : "var(--dsw-alias-border-l1)"),
                          background:
                            catalogCategory === cat
                              ? "rgba(99, 102, 241, 0.15)"
                              : "var(--dsw-alias-surface-l1)",
                          color:
                            catalogCategory === cat
                              ? "var(--dsw-alias-primary, #6366f1)"
                              : "var(--dsw-alias-label-secondary)",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                        },
                      },
                      cat,
                    );
                  }),
                ),
              ),
              // Grid
              h(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: "10px",
                  },
                },
                filteredIcons.map(function (k) {
                  return h(
                    "div",
                    {
                      key: k,
                      onClick: function () {
                        setNewIcon(k);
                        setActiveTab("mappings");
                      },
                      title: "Click to map " + k,
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                        padding: "16px 10px",
                        borderRadius: "10px",
                        border: "1px solid var(--dsw-alias-border-l1)",
                        background: "var(--dsw-alias-surface-l1)",
                        cursor: "pointer",
                        transition: "all 120ms ease",
                        userSelect: "none",
                      },
                      onMouseEnter: function (e) {
                        e.currentTarget.style.borderColor = "var(--dsw-alias-primary, #6366f1)";
                        e.currentTarget.style.background = "var(--dsw-alias-surface-l2)";
                      },
                      onMouseLeave: function (e) {
                        e.currentTarget.style.borderColor = "var(--dsw-alias-border-l1)";
                        e.currentTarget.style.background = "var(--dsw-alias-surface-l1)";
                      },
                    },
                    renderCatalogIcon(k, 28, "dsh-icon-animated"),
                    h(
                      "div",
                      {
                        style: {
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                          textAlign: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                        },
                      },
                      k,
                    ),
                    h(
                      "div",
                      { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" } },
                      LUCIDE_ICONS_CATALOG[k].category,
                    ),
                  );
                }),
              ),
            )
          : null,

        // Tab 2: Custom Mappings
        activeTab === "mappings"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "16px" } },
              // Category Selector
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    gap: "8px",
                    borderBottom: "1px solid var(--dsw-alias-border-l1)",
                    paddingBottom: "10px",
                    overflowX: "auto",
                  },
                },
                [
                  { id: "extensions", label: "File Extensions (.ts, .py)" },
                  { id: "folders", label: "Folders & Categories" },
                  { id: "apps", label: "Applications (Terminal, Docker)" },
                  { id: "agents", label: "Agent Roles (Code, Planning)" },
                ].map(function (tab) {
                  var isSel = activeMappingCategory === tab.id;
                  return h(
                    "button",
                    {
                      key: tab.id,
                      type: "button",
                      onClick: function () {
                        setActiveMappingCategory(tab.id);
                      },
                      style: {
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "none",
                        background: isSel ? "var(--dsw-alias-primary, #6366f1)" : "transparent",
                        color: isSel ? "#ffffff" : "var(--dsw-alias-label-secondary)",
                        fontWeight: isSel ? 600 : 400,
                        fontSize: "12px",
                        cursor: "pointer",
                      },
                    },
                    tab.label,
                  );
                }),
              ),

              // Add New Mapping Card
              h(
                "div",
                {
                  style: {
                    borderRadius: "10px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  },
                },
                h(
                  "div",
                  { style: { fontSize: "13px", fontWeight: 600 } },
                  "Add / Override Mapping for " + activeMappingCategory,
                ),
                h(
                  "div",
                  {
                    style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
                  },
                  h("input", {
                    type: "text",
                    placeholder:
                      activeMappingCategory === "extensions"
                        ? "e.g. .vue, .graphql, .swift"
                        : activeMappingCategory === "apps"
                          ? "e.g. Spotify, Notion"
                          : "e.g. Documentation, Architect",
                    value: newTarget,
                    onChange: function (e) {
                      setNewTarget(e.target.value);
                    },
                    style: {
                      flex: "1 1 200px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--dsw-alias-border-l2)",
                      background: "var(--dsw-alias-surface-l2)",
                      color: "inherit",
                      fontSize: "13px",
                    },
                  }),
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "8px" } },
                    renderCatalogIcon(newIcon, 22),
                    h(
                      "select",
                      {
                        value: newIcon,
                        onChange: function (e) {
                          setNewIcon(e.target.value);
                        },
                        style: {
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid var(--dsw-alias-border-l2)",
                          background: "var(--dsw-alias-surface-l2)",
                          color: "inherit",
                          fontSize: "13px",
                          cursor: "pointer",
                        },
                      },
                      iconKeys.map(function (k) {
                        return h(
                          "option",
                          { key: k, value: k },
                          k + " (" + LUCIDE_ICONS_CATALOG[k].category + ")",
                        );
                      }),
                    ),
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: handleAddMapping,
                      style: {
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: "none",
                        background: "var(--dsw-alias-primary, #6366f1)",
                        color: "#ffffff",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer",
                      },
                    },
                    "Save Mapping",
                  ),
                ),
              ),

              // Active Mappings Table
              h(
                "div",
                {
                  style: {
                    borderRadius: "10px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    overflow: "hidden",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      padding: "10px 16px",
                      background: "var(--dsw-alias-surface-l2)",
                      borderBottom: "1px solid var(--dsw-alias-border-l1)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  },
                  h(
                    "span",
                    { style: { fontSize: "12px", fontWeight: 600 } },
                    "Configured Rules (" + mappingKeys.length + ")",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: handleResetCategory,
                      style: {
                        padding: "3px 8px",
                        borderRadius: "4px",
                        border: "1px solid var(--dsw-alias-border-l2)",
                        background: "transparent",
                        color: "var(--dsw-alias-label-secondary)",
                        fontSize: "11px",
                        cursor: "pointer",
                      },
                    },
                    "Reset Category to Defaults",
                  ),
                ),
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      maxHeight: "380px",
                      overflowY: "auto",
                    },
                  },
                  mappingKeys.length === 0
                    ? h(
                        "div",
                        {
                          style: {
                            padding: "24px",
                            textAlign: "center",
                            color: "var(--dsw-alias-label-tertiary)",
                            fontSize: "13px",
                          },
                        },
                        "No mappings configured for this category.",
                      )
                    : mappingKeys.map(function (targetKey) {
                        var assignedIcon = currentCategoryMappings[targetKey];
                        return h(
                          "div",
                          {
                            key: targetKey,
                            style: {
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 16px",
                              borderBottom:
                                "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                            },
                          },
                          h(
                            "div",
                            { style: { display: "flex", alignItems: "center", gap: "12px" } },
                            renderCatalogIcon(assignedIcon, 20),
                            h(
                              "div",
                              null,
                              h(
                                "span",
                                {
                                  style: {
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "var(--dsw-alias-label-primary)",
                                  },
                                },
                                targetKey,
                              ),
                              h(
                                "span",
                                {
                                  style: {
                                    marginLeft: "8px",
                                    fontSize: "11px",
                                    color: "var(--dsw-alias-label-tertiary)",
                                  },
                                },
                                "→ " + assignedIcon,
                              ),
                            ),
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              onClick: function () {
                                handleRemoveMapping(targetKey);
                              },
                              style: {
                                padding: "4px 8px",
                                borderRadius: "4px",
                                border: "none",
                                background: "transparent",
                                color: "var(--dsw-alias-state-error-primary, #ef4444)",
                                fontSize: "12px",
                                cursor: "pointer",
                              },
                            },
                            "Delete",
                          ),
                        );
                      }),
                ),
              ),

              // Footer Actions
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "8px",
                  },
                },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: handleResetAll,
                    style: {
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--dsw-alias-border-l2)",
                      background: "transparent",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    },
                  },
                  "Reset All Mappings to Factory Defaults",
                ),
              ),
            )
          : null,
      );
    }

    // Helper Modals
    /**
     * Renders UI & Media components using Lucide SVG.
     *
     * Returns a JSX element representing the UI & Media component.
     *
     * Guarantees the returned element to be a Lucide SVG composition.
     */
    function NewSessionModal(props) {
      var onClose = props.onClose,
        onCreated = props.onCreated;
      var nameState = React.useState("");
      var name = nameState[0],
        setName = nameState[1];
      var creatingState = React.useState(false);
      var creating = creatingState[0],
        setCreating = creatingState[1];

      /**
       * Renders a Lucide SVG icon based on the provided state and context.
       *
       * Returns an SVG element representing the specified icon.
       *
       * Fails if the provided state or context is invalid, returning null.
       */
      var handleCreate = function () {
        setCreating(true);
        fetch(QUOTAS_API + "/tmux/sessions/new", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name }),
        })
          .then(function () {
            onCreated();
            onClose();
          })
          .finally(function () {
            setCreating(false);
          });
      };

      return h(
        "div",
        {
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
          },
        },
        h(
          "div",
          {
            style: {
              width: "440px",
              padding: "24px",
              borderRadius: "12px",
              background: "var(--dsw-alias-surface-l0, #1e1e2e)",
              border: "1px solid var(--dsw-alias-border-l2)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            },
          },
          h(
            "h3",
            { style: { margin: 0, fontSize: "16px", fontWeight: 600 } },
            "Create New Terminal Session",
          ),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Session Name:"),
          h("input", {
            value: name,
            onChange: function (e) {
              setName(e.target.value);
            },
            placeholder: "e.g. runner-1, worker-bg",
            style: MODAL_INPUT_STYLE,
          }),
          h(
            "div",
            {
              style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" },
            },
            h(
              "button",
              {
                onClick: onClose,
                style: MODAL_CANCEL_BUTTON_STYLE,
              },
              "Cancel",
            ),
            h(
              "button",
              {
                onClick: handleCreate,
                disabled: creating,
                style: MODAL_PRIMARY_BUTTON_STYLE,
              },
              creating ? "Creating…" : "Create Session",
            ),
          ),
        ),
      );
    }

    /**
     * Displays a modal for editing values, containing UI elements like paths and lines.
     *
     * The modal includes paths and lines that form visual elements, allowing users to
     * interact and edit the displayed UI components.
     *
     * @returns A Lucide SVG representation of the modal with various paths and lines.
     */
    function EditValueModal(props) {
      var target = props.target,
        onClose = props.onClose,
        onSaved = props.onSaved;
      var valueState = React.useState("");
      var value = valueState[0],
        setValue = valueState[1];
      var savingState = React.useState(false);
      var saving = savingState[0],
        setSaving = savingState[1];

      /**
       * Renders a Lucide SVG icon based on the provided state `s` and context `c`.
       * Returns a React element representing the icon.
       * Fails if `s` or `c` are undefined or not of the expected types.
       */
      var handleSave = function () {
        setSaving(true);
        fetch(
          VAULT_API +
            "/accounts/" +
            encodeURIComponent(target.ref) +
            "?account=" +
            encodeURIComponent(target.account),
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value: value }),
          },
        )
          .then(function () {
            onSaved();
            onClose();
          })
          .finally(function () {
            setSaving(false);
          });
      };

      return h(
        "div",
        {
          style: MODAL_OVERLAY_STYLE,
        },
        h(
          "div",
          {
            style: {
              width: "440px",
              padding: "24px",
              borderRadius: "12px",
              background: "var(--dsw-alias-surface-l0, #1e1e2e)",
              border: "1px solid var(--dsw-alias-border-l2)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            },
          },
          h(
            "h3",
            { style: { margin: 0, fontSize: "16px", fontWeight: 600 } },
            "Edit Credential Value",
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
            "Updating " + target.ref + " for @" + target.account,
          ),
          h("input", {
            type: "password",
            placeholder: "Enter new secret / API key…",
            value: value,
            onChange: function (e) {
              setValue(e.target.value);
            },
            style: {
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid var(--dsw-alias-border-l2)",
              background: "var(--dsw-alias-surface-l1)",
              color: "inherit",
              width: "100%",
              boxSizing: "border-box",
            },
          }),
          h(
            "div",
            {
              style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" },
            },
            h(
              "button",
              {
                onClick: onClose,
                style: MODAL_CANCEL_BUTTON_STYLE,
              },
              "Cancel",
            ),
            h(
              "button",
              {
                onClick: handleSave,
                disabled: saving,
                style: MODAL_PRIMARY_BUTTON_STYLE,
              },
              saving ? "Saving…" : "Save Secret",
            ),
          ),
        ),
      );
    }

    /**
     * Displays a modal to add a new key to the system.
     *
     * Guarantees the modal will be shown with the specified type of key.
     *
     * @param {string} type - The type of key to add, e.g., "Cpu", "GitFork".
     */
    function AddKeyModal(props) {
      var target = props.target,
        onClose = props.onClose,
        onSaved = props.onSaved;
      var prov = target.prov;
      var refState = React.useState(prov.defaultKeys[0] || prov.prefixes[0] + "API_KEY");
      var ref = refState[0],
        setRef = refState[1];
      var accountState = React.useState("default");
      var account = accountState[0],
        setAccount = accountState[1];
      var valueState = React.useState("");
      var value = valueState[0],
        setValue = valueState[1];
      var savingState = React.useState(false);
      var saving = savingState[0],
        setSaving = savingState[1];

      /**
       * Loads custom icon mappings from local storage for the target tab.
       *
       * Guarantees that the target tab will be selected if its criteria match "trajectory" or "轨迹".
       * Fails by selecting the first inactive tab if no matching target is found.
       */
      var handleSave = function () {
        setSaving(true);
        fetch(
          VAULT_API +
            "/accounts/" +
            encodeURIComponent(ref) +
            "?account=" +
            encodeURIComponent(account),
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value: value }),
          },
        )
          .then(function () {
            onSaved();
            onClose();
          })
          .finally(function () {
            setSaving(false);
          });
      };

      return h(
        "div",
        {
          style: MODAL_OVERLAY_STYLE,
        },
        h(
          "div",
          {
            style: {
              width: "460px",
              padding: "24px",
              borderRadius: "12px",
              background: "var(--dsw-alias-surface-l0, #1e1e2e)",
              border: "1px solid var(--dsw-alias-border-l2)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            },
          },
          h(
            "h3",
            { style: { margin: 0, fontSize: "16px", fontWeight: 600 } },
            "Add Key for " + prov.name,
          ),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Credential Reference:"),
          h("input", {
            value: ref,
            onChange: function (e) {
              setRef(e.target.value);
            },
            style: MODAL_INPUT_STYLE,
          }),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Account Profile:"),
          h("input", {
            value: account,
            onChange: function (e) {
              setAccount(e.target.value);
            },
            style: MODAL_INPUT_STYLE,
          }),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Secret / Key Value:"),
          h("input", {
            type: "password",
            value: value,
            onChange: function (e) {
              setValue(e.target.value);
            },
            placeholder: "Paste key here…",
            style: MODAL_INPUT_STYLE,
          }),
          h(
            "div",
            {
              style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" },
            },
            h(
              "button",
              {
                onClick: onClose,
                style: MODAL_CANCEL_BUTTON_STYLE,
              },
              "Cancel",
            ),
            h(
              "button",
              {
                onClick: handleSave,
                disabled: saving || !ref || !value,
                style: MODAL_PRIMARY_BUTTON_STYLE,
              },
              saving ? "Adding…" : "Add Key",
            ),
          ),
        ),
      );
    }

    /**
     * Filters and updates the list of icons based on the catalog category and search term.
     *
     * Guarantees: Updates the `filteredIcons` state with icons matching the catalog category and search term.
     *
     * Parameters: None.
     *
     * On failure: Does not modify the `filteredIcons` state if no icons match the criteria.
     */
    function AddModelModal(props) {
      var target = props.target,
        onClose = props.onClose,
        onSaved = props.onSaved;
      var prov = target.prov;
      var idState = React.useState("");
      var id = idState[0],
        setId = idState[1];
      var nameState = React.useState("");
      var name = nameState[0],
        setName = nameState[1];
      var contextState = React.useState("128k");
      var context = contextState[0],
        setContext = contextState[1];

      var /** handleSave implementation. */
        handleSave = function () {
          prov.models.push({ id: id, name: name || id, context: context, tags: ["Custom"] });
          onSaved();
          onClose();
        };

      return h(
        "div",
        {
          style: MODAL_OVERLAY_STYLE,
        },
        h(
          "div",
          {
            style: {
              width: "440px",
              padding: "24px",
              borderRadius: "12px",
              background: "var(--dsw-alias-surface-l0, #1e1e2e)",
              border: "1px solid var(--dsw-alias-border-l2)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            },
          },
          h(
            "h3",
            { style: { margin: 0, fontSize: "16px", fontWeight: 600 } },
            "Add Custom Model to " + prov.name,
          ),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Model ID:"),
          h("input", {
            value: id,
            onChange: function (e) {
              setId(e.target.value);
            },
            placeholder: "e.g. claude-3-7-sonnet-20250219",
            style: MODAL_INPUT_STYLE,
          }),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Display Name:"),
          h("input", {
            value: name,
            onChange: function (e) {
              setName(e.target.value);
            },
            placeholder: "e.g. Claude 3.7 Sonnet (Latest)",
            style: MODAL_INPUT_STYLE,
          }),
          h("label", { style: { fontSize: "12px", fontWeight: 500 } }, "Context Window:"),
          h("input", {
            value: context,
            onChange: function (e) {
              setContext(e.target.value);
            },
            placeholder: "e.g. 200k, 1M",
            style: MODAL_INPUT_STYLE,
          }),
          h(
            "div",
            {
              style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" },
            },
            h(
              "button",
              {
                onClick: onClose,
                style: MODAL_CANCEL_BUTTON_STYLE,
              },
              "Cancel",
            ),
            h(
              "button",
              {
                onClick: handleSave,
                disabled: !id,
                style: MODAL_PRIMARY_BUTTON_STYLE,
              },
              "Add Model",
            ),
          ),
        ),
      );
    }

    /**
     * Displays a modal for managing OAuth flow mappings. Updates the current category mappings and saves them.
     * Guarantees that the mappings are reset to default and saved after the modal is closed.
     * Fails if the `activeMappingCategory` is not defined or if `setMappings` or `saveCustomIconMappings` fails.
     */
    function OAuthFlowModal(props) {
      var target = props.target,
        onClose = props.onClose;
      var flowState = React.useState(null);
      var flow = flowState[0],
        setFlow = flowState[1];

      React.useEffect(
        function () {
          fetch(VAULT_API + "/login/device/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider: target.providerId }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              setFlow(res);
            });
        },
        [target.providerId],
      );

      return h(
        "div",
        {
          style: MODAL_OVERLAY_STYLE,
        },
        h(
          "div",
          {
            style: {
              width: "460px",
              padding: "24px",
              borderRadius: "12px",
              background: "var(--dsw-alias-surface-l0, #1e1e2e)",
              border: "1px solid var(--dsw-alias-border-l2)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              textAlign: "center",
            },
          },
          h(
            "h3",
            { style: { margin: 0, fontSize: "16px", fontWeight: 600 } },
            "Sign In to " + target.label,
          ),
          flow
            ? h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "12px" } },
                h(
                  "div",
                  { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                  "1. Copy device code:",
                ),
                h(
                  "code",
                  {
                    style: {
                      fontSize: "22px",
                      fontWeight: 700,
                      letterSpacing: "3px",
                      color: "var(--dsw-alias-primary, #6366f1)",
                    },
                  },
                  flow.userCode,
                ),
                h(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      color: "var(--dsw-alias-label-secondary)",
                      marginTop: "4px",
                    },
                  },
                  "2. Authorize in browser:",
                ),
                h(
                  "a",
                  {
                    href: flow.verificationUri,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: {
                      display: "inline-block",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      background: "var(--dsw-alias-primary, #6366f1)",
                      color: "#fff",
                      textDecoration: "none",
                      fontSize: "13px",
                      fontWeight: 600,
                    },
                  },
                  "Authorize in Browser ↗",
                ),
              )
            : h(
                "div",
                { style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" } },
                "Starting OAuth session…",
              ),
          h(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", marginTop: "8px" } },
            h(
              "button",
              {
                onClick: onClose,
                style: MODAL_CANCEL_BUTTON_STYLE,
              },
              "Done",
            ),
          ),
        ),
      );
    }

    // 9. UNIFIED FILESYSTEM & WORKSPACES BROWSER
    /**
     * Displays a modal for viewing and searching files. The caller must ensure that
     * `search` is provided as the initial search query. The modal returns the
     * current search query and allows users to search for files by name or tag.
     * On failure, the modal simply renders the controls without changing the search
     * query.
     */
    function FileViewerModal(props) {
      var file = props.file,
        onClose = props.onClose;
      var loadingState = React.useState(!file.content && !file.error);
      var loading = loadingState[0],
        setLoading = loadingState[1];
      var contentState = React.useState(file.content || "");
      var content = contentState[0],
        setContent = contentState[1];
      var errorState = React.useState(file.error || null);
      var error = errorState[0],
        setError = errorState[1];

      React.useEffect(
        function () {
          if (!file.content && !file.error) {
            setLoading(true);
            fetch(QUOTAS_API + "/fs/read?path=" + encodeURIComponent(file.path))
              .then(function (r) {
                return r.json();
              })
              .then(function (res) {
                if (res.error) setError(res.error);
                else setContent(res.content || "");
              })
              .catch(function (err) {
                setError(err.message);
              })
              .finally(function () {
                setLoading(false);
              });
          }
        },
        [file],
      );

      return h(
        "div",
        {
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
            backdropFilter: "blur(2px)",
          },
          onClick: onClose,
        },
        h(
          "div",
          {
            style: {
              width: "min(800px, 90vw)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: "12px",
              background: "var(--dsw-alias-bg-layer-2, #161b22)",
              border: "1px solid var(--dsw-alias-border-l2)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
            },
            onClick: function (e) {
              e.stopPropagation();
            },
          },
          // Modal Header
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--dsw-alias-border-l1)",
              },
            },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
              h(FileGlyph, { size: 16 }),
              h(
                "span",
                {
                  style: {
                    fontWeight: 600,
                    fontSize: "14px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                file.name,
              ),
              h(
                "span",
                {
                  style: {
                    fontSize: "11px",
                    color: "var(--dsw-alias-label-tertiary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                file.path,
              ),
            ),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h(
                "button",
                {
                  onClick: function () {
                    navigator.clipboard && navigator.clipboard.writeText(content);
                    alert("Copied to clipboard!");
                  },
                  style: {
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "transparent",
                    color: "inherit",
                    fontSize: "11px",
                    cursor: "pointer",
                  },
                },
                "Copy",
              ),
              h(
                "button",
                {
                  onClick: onClose,
                  style: {
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    fontSize: "14px",
                    cursor: "pointer",
                  },
                },
                "✕",
              ),
            ),
          ),
          // Modal Body
          h(
            "pre",
            {
              style: {
                flex: 1,
                margin: 0,
                padding: "16px",
                overflowY: "auto",
                maxHeight: "calc(85vh - 70px)",
                fontFamily: "var(--ds-font-mono, monospace)",
                fontSize: "12px",
                lineHeight: "1.5",
                color: "var(--dsw-alias-label-primary, #e6edf3)",
                background: "var(--dsw-alias-bg-layer-1, #0d1117)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              },
            },
            loading ? "Loading file content…" : error ? "Error: " + error : content,
          ),
        ),
      );
    }

    // The sidebar tree (section groups, rows, context menus) is owned by
    // client/sidebar-tree/*.js, prepended ahead of this file by the package
    // build script the same way crypto-polyfill.js and glyph-factory.js are
    // (see #138). It receives everything it needs to render through one
    // runtime object instead of relying on this file's module scope, so it
    // can be read, tested and changed without the rest of this bundle.
    var sidebarTreeRuntime = {
      React: React,
      h: h,
      quotasApi: QUOTAS_API,
      ensureTreeStyles: ensureTreeStyles,
      ensureModelPickerDecoration: ensureModelPickerDecoration,
      renderAppIcon: renderAppIcon,
      SelectDropdownMenu: SelectDropdownMenu,
      formatTimeAgo: __dshFormatTimeAgo,
      glyphs: {
        Chat: ChatGlyph,
        Terminals: TerminalsGlyph,
        Containers: ContainersGlyph,
        TriangleRight: TriangleRightFill14,
        Pin: PinGlyph,
        Ellipsis: EllipsisGlyph,
        Edit: EditGlyph,
        Branch: BranchGlyph,
        Trash: TrashGlyph,
        Subagent: SubagentGlyph,
        Search: SearchGlyph,
        Sliders: SlidersGlyph,
        Plus: PlusGlyph,
        FolderPlus: FolderPlusGlyph,
        BlueFolder: BlueFolderGlyph,
        HostMachine: HostMachineGlyph,
        HardDrive: HardDriveGlyph,
        File: FileGlyph,
        ArchiveBox: ArchiveBoxGlyph,
        App: AppGlyph,
        Library: LibraryGlyph,
        System: SystemGlyph,
        Users: UsersGlyph,
        Repo: RepoGlyph,
        Workspace: WorkspaceGlyph,
        FolderOpen: FolderOpenGlyph,
        Restore: RestoreGlyph,
      },
    };
    var SidebarTree = __dshCreateSidebarTree(sidebarTreeRuntime);

    /**
     * The `sidebar.footer.action` slot's terminals/containers manager: a
     * bottom panel toggle plus the top conversation tab bar and secondary
     * sidebar dock. Distinct from the sidebar tree's own Containers/Terminals
     * groups (`SidebarTree` above) -- this is the full-screen management
     * surface, not a tree row.
     */
    function GlobalTerminalAndContainerManager() {
      var isBottomOpenState = React.useState(false);
      var isBottomOpen = isBottomOpenState[0],
        setBottomOpen = isBottomOpenState[1];
      var panelState = React.useState(null); // { type: "terminal", session: "..." } | { type: "container", id: "..." }
      var panel = panelState[0],
        setPanel = panelState[1];

      React.useEffect(function () {
        /**
         * Toggles the context menu for the archived chat item.
         *
         * On failure, the context menu is set to open at the cursor's position.
         */
        var onToggleBottom = function () {
          setBottomOpen(function (v) {
            return !v;
          });
        };
        /**
         * Opens the chat in the bottom panel when the item is clicked.
         *
         * This function does nothing on failure since it's just an event handler.
         */
        var onMoveToBottom = function (e) {
          var tab = e.detail;
          if (tab) {
            setPanel({ type: tab.type, session: tab.session || tab.id, id: tab.id });
            setBottomOpen(true);
          }
        };
        /**
         * Opens the terminal for the specified chat.
         *
         * Emits an event to set the ellipsis open state for the chat.
         *
         * Fails if the chat ID is invalid or not found.
         */
        var onOpenTerm = function (e) {
          var sess = (e && e.detail && e.detail.session) || "0";
          setPanel({ type: "terminal", session: sess, id: sess });
          setBottomOpen(true);
        };
        /**
         * Displays the chat title and time updated, providing a title tooltip and formatted time.
         *
         * Returns a JSX element representing the chat title and its last updated time.
         *
         * Fails if the `chat` object is missing `title` or `updatedAt` properties.
         */
        var onOpenCont = function (e) {
          var id = (e && e.detail && e.detail.id) || null;
          setPanel({ type: "container", session: null, id: id });
          setBottomOpen(true);
        };

        window.addEventListener("dsh:toggle-bottom-panel", onToggleBottom);
        window.addEventListener("dsh:tab-moved-to-bottom", onMoveToBottom);
        window.addEventListener("dsh:open-terminal", onOpenTerm);
        window.addEventListener("dsh:open-container", onOpenCont);

        // Global Keyboard Shortcuts
        /**
         * Handles the global keydown event.
         *
         * Guarantees that any global keydown actions are processed.
         * Fails if the keydown event does not match any predefined actions.
         */
        var onGlobalKeyDown = function (e) {
          var isMac =
            typeof navigator !== "undefined" &&
            /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
          var cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
          var altOrOpt = e.altKey;

          // 1. Cmd+J / Ctrl+J -> Toggle Bottom Panel
          if (
            cmdOrCtrl &&
            !altOrOpt &&
            !e.shiftKey &&
            (e.key === "j" || e.key === "J" || e.code === "KeyJ")
          ) {
            e.preventDefault();
            e.stopPropagation();
            onToggleBottom();
            return;
          }

          // 2. Cmd+Opt+B / Ctrl+Alt+B -> Toggle Secondary Sidebar
          if (
            cmdOrCtrl &&
            altOrOpt &&
            !e.shiftKey &&
            (e.key === "b" || e.key === "B" || e.code === "KeyB")
          ) {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("dsh:toggle-secondary-sidebar"));
            return;
          }

          // 3. Cmd+Shift+P / Ctrl+Shift+P -> Trigger Sidebar Search
          if (cmdOrCtrl && e.shiftKey && (e.key === "p" || e.key === "P" || e.code === "KeyP")) {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("dsh:trigger-sidebar-search"));
            return;
          }
        };

        window.addEventListener("keydown", onGlobalKeyDown, { capture: true });

        return function () {
          window.removeEventListener("dsh:toggle-bottom-panel", onToggleBottom);
          window.removeEventListener("dsh:tab-moved-to-bottom", onMoveToBottom);
          window.removeEventListener("dsh:open-terminal", onOpenTerm);
          window.removeEventListener("dsh:open-container", onOpenCont);
          window.removeEventListener("keydown", onGlobalKeyDown, { capture: true });
        };
      }, []);

      return h(
        React.Fragment,
        null,
        h(TopConversationTabBar, {}),
        h(RightSidebarDock, {}),
        isBottomOpen || panel
          ? h(BottomTerminalPanel, {
              initialSession: panel && panel.type === "terminal" ? panel.session : undefined,
              initialContainerId: panel && panel.type === "container" ? panel.id : undefined,
              onClose: function () {
                setBottomOpen(false);
                setPanel(null);
              },
            })
          : null,
      );
    }

    if (typeof window !== "undefined") {
      window.__dsh_SidebarTree = SidebarTree;
    }

    /**
     * Returns an array of active chat session entries sorted by the most recent update.
     * Fails if the directory path is invalid or the session entries are not found.
     * @returns {Array} An array of active chat session entries.
     */
    function apply(ctx) {
      if (typeof window !== "undefined") {
        window.__dsh_ctx__ = ctx;
        window.__dsh_SidebarTree = SidebarTree;
      }
      ensureModelPickerDecoration();
      /**
       * Builds the props the `sidebar.workspaces` slot injects into
       * `SidebarTree` on top of the base `wide`/`expandSidebar` props
       * `sidebar-shell` supplies: the session/workspace actions, and the
       * shared `sidebarPreferences` store. `renameSession`, `archiveSession`
       * and `forkSession` reject instead of resolving when there is nothing
       * to act on -- e.g. a session with no live cordis binding -- so the
       * sidebar tree's `session-action-dispatch.js` has a real failure to
       * surface instead of a click that silently did nothing (#98).
       * @returns the injected props.
       */
      var browserInjected = function () {
        return {
          startSession: function (workspaceId) {
            ctx.workspaces && ctx.workspaces.startSession(workspaceId);
          },
          open: function (sessionId) {
            ctx.sessions && ctx.sessions.open(sessionId);
          },
          createWorkspace: function (input) {
            return ctx.workspaces && ctx.workspaces.create
              ? ctx.workspaces.create(input)
              : Promise.reject(new Error("Workspaces are unavailable right now."));
          },
          renameSession: function (sessionId, title) {
            var session = ctx.sessions && ctx.sessions.binding(sessionId)?.session;
            if (!session)
              return Promise.reject(
                new Error("This session has no active binding, so it can't be renamed right now."),
              );
            return session.rename(title);
          },
          archiveSession: function (sessionId) {
            return ctx.workspaces
              ? ctx.workspaces.archiveSession(sessionId)
              : Promise.reject(new Error("Workspaces are unavailable right now."));
          },
          forkSession: function (sessionId) {
            if (!ctx.sessions || !ctx.sessions.fork)
              return Promise.reject(new Error("Forking is unavailable right now."));
            return ctx.sessions
              .fork({ sessionId: sessionId, increaseTitle: true })
              .then(function (childId) {
                ctx.sessions.open(childId);
              });
          },
          preferences: ctx.sidebarPreferences,
        };
      };

      // 0. Dynamic Filesystem & Workspaces Browser (the sidebar tree, owned
      // by client/sidebar-tree/*.js -- see the SidebarTree construction above)
      ctx.slots.inject(
        "sidebar.workspaces",
        function () {
          return ctx.slots.register(
            {
              name: "sidebar.workspaces",
              priority: -100,
              order: 0,
              locale: "sidebar",
              inject: browserInjected,
            },
            SidebarTree,
          );
        },
        "providers: sidebar tree (dynamic filesystem and workspaces browser)",
      );

      // 0b. Global Terminals & Containers Manager + Top Tab Bar
      ctx.slots.inject(
        "sidebar.footer.action",
        function () {
          return ctx.slots.register(
            {
              name: "sidebar.footer.action",
              id: "dsh-terminals-manager",
              order: 999,
            },
            GlobalTerminalAndContainerManager,
          );
        },
        "providers: global terminals manager and top tab bar",
      );

      // 1. Providers Settings Section (Order 8): consolidates the former
      // "accounts" and "models" sections into one, with accounts/credential
      // management and the model catalog as sub-tabs (#237).
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "providers",
              priority: -10,
              order: 8,
              locale: NS,
              label: function () {
                return "Providers";
              },
              inject: function () {
                return {};
              },
            },
            ProvidersSection,
          );
        },
        "providers: providers section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "providers",
              priority: -10,
              order: 0,
            },
            ProvidersGlyph,
          );
        },
        "providers: providers nav glyph",
      );

      // 3. Apps Settings Section (Order 10)
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "apps",
              priority: -10,
              order: 10,
              locale: NS,
              label: function () {
                return "Apps";
              },
              inject: function () {
                return {};
              },
            },
            AppsSection,
          );
        },
        "providers: apps section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "apps",
              priority: -10,
              order: 0,
            },
            AppsGlyph,
          );
        },
        "providers: apps nav glyph",
      );

      // Terminals and Containers no longer register standalone settings.section entries: their
      // configuration (TmuxSettingsSection, DockerSettingsSection) now lives as sub-tabs of the
      // Apps section above (see AppsSection / APPS_SUBTABS). TerminalsGlyph and ContainersGlyph
      // remain in use elsewhere (session-tree UI), so those glyph definitions are unchanged.

      // 4. Tools Settings Section (Order 25)
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "tools",
              priority: -10,
              order: 25,
              locale: NS,
              label: function () {
                return "Tools";
              },
              inject: function () {
                return {};
              },
            },
            ToolsSection,
          );
        },
        "providers: tools section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "tools",
              priority: -10,
              order: 0,
            },
            ToolsGlyph,
          );
        },
        "providers: tools nav glyph",
      );

      // 5. Loops Settings Section (Order 26)
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "loops",
              priority: -10,
              order: 26,
              locale: NS,
              label: function () {
                return "Loops";
              },
              inject: function () {
                return {};
              },
            },
            LoopsSection,
          );
        },
        "providers: loops section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "loops",
              priority: -10,
              order: 0,
            },
            LoopsGlyph,
          );
        },
        "providers: loops nav glyph",
      );

      // 6. Icons: one page of the Appearance section (Order 20)
      //
      // The icon catalog stays owned here; only its mount point moved from the
      // settings nav to the seat the Appearance section declares.
      ctx.slots.inject(
        "settings.appearance.tab",
        function () {
          return ctx.slots.register(
            {
              name: "settings.appearance.tab",
              id: "icons",
              priority: -10,
              order: 20,
              locale: NS,
              label: function () {
                return "Icons";
              },
              inject: function () {
                return {};
              },
            },
            IconsSection,
          );
        },
        "providers: appearance icons tab",
      );
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "sessions", "workspaces", "sidebarPreferences"];
    return module.exports;
  },
});

// jscpd:ignore-end
