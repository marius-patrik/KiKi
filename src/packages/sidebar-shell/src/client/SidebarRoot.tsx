import { useEffect, useState } from "react";
import {
  FishLogo,
  IconNewChatOutlineMedium,
  IconNewChatOutlineRegular,
  IconPanelLeftOutlineRegular,
  ShortcutKeys,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { SidebarRootComponentProps } from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { ShortcutCommandId } from "@deepseek-ai/dsh-client-shortcuts/client";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@dsh-stack/sidebar-preferences/client";
import { SidebarOptionsMenu } from "./SidebarOptionsMenu.js";
import { SidebarPanelRow } from "./SidebarPanelRow.js";

const railWidth = 56;
const transition = "width 180ms ease, opacity 150ms ease";

/** The layout-owned keyboard command that toggles the sidebar column. */
const TOGGLE_SHORTCUT_ID = "sidebar.left.toggle" as ShortcutCommandId;

/** The Workspace-UI-owned keyboard command that starts a new session. */
const NEW_SESSION_SHORTCUT_ID = "session.new" as ShortcutCommandId;

/**
 * Accessible name of the global panel navigation landmark.
 *
 * The Stack's `sidebar` dictionary (owned by `@dsh-stack/tweaks`) carries the
 * session and toggle keys but not the harness's `panels.label`, so this label
 * sits beside the shell's other hardcoded rail-control labels rather than
 * claiming a dictionary key nothing installs.
 */
const PANELS_LABEL = "Global panels";

export type SidebarRootProps = SidebarRootComponentProps & {
  sidebarPreferences: ClientContext["sidebarPreferences"];
};

/** SidebarRoot implementation. */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  selectPanel,
  usePanels,
  useShortcuts,
  usePanelInfo,
  t,
  renderSlot,
  sidebarPreferences,
}: SidebarRootProps) {
  const [preferences, setPreferences] = useState(sidebarPreferences.get());

  useEffect(
    () => sidebarPreferences.subscribe(() => setPreferences(sidebarPreferences.get())),
    [sidebarPreferences],
  );

  const panels = usePanels((snapshot) => snapshot);
  const toggleShortcut = useShortcuts((rows) => rows.find((row) => row.id === TOGGLE_SHORTCUT_ID));
  const newSessionShortcut = useShortcuts((rows) =>
    rows.find((row) => row.id === NEW_SESSION_SHORTCUT_ID),
  );

  const wide = !collapsed;
  const contentWidth = wide ? width : railWidth;
  const showBrand = preferences.showBrandLogo;

  return (
    <aside
      data-dsh-plugin="stack-sidebar"
      data-dsh-part="sidebar-shell"
      style={{
        width: contentWidth,
        minWidth: contentWidth,
        maxWidth: contentWidth,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: wide ? "row" : "column",
          alignItems: "center",
          justifyContent: wide ? "space-between" : "center",
          gap: wide ? 0 : 4,
          minHeight: 48,
          padding: wide ? "8px 10px 4px" : "8px 6px 4px",
        }}
      >
        {wide && showBrand ? (
          <button
            type="button"
            onClick={() => startSession()}
            aria-label={t("session.new.label")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              border: 0,
              background: "transparent",
              color: "inherit",
              padding: 4,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {renderSlot("sidebar.brand.mark", { size: 24 }, { fallback: <FishLogo size={24} /> })}
            {renderSlot(
              "sidebar.brand.name",
              {},
              { fallback: <span style={{ fontWeight: 600 }}>DSH</span> },
            )}
          </button>
        ) : showBrand ? (
          <span aria-hidden="true" style={{ width: 32, height: 32 }}>
            {renderSlot("sidebar.brand.mark", { size: 24 }, { fallback: <FishLogo size={24} /> })}
          </span>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {wide ? (
            <SidebarOptionsMenu
              showFiles={preferences.showFiles}
              onShowFilesChange={(value) => sidebarPreferences.set("showFiles", value)}
            />
          ) : null}

          <Tooltip
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            shortcutKeys={toggleShortcut?.keys}
            delayMs={500}
          >
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-keyshortcuts={toggleShortcut?.aria}
              onClick={toggleSidebar}
              style={{
                width: 34,
                height: 34,
                display: "grid",
                placeItems: "center",
                border: 0,
                borderRadius: 8,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <IconPanelLeftOutlineRegular size={wide ? 16 : 18} />
              {!wide ? renderSlot("sidebar.toggle.badge", {}) : null}
            </button>
          </Tooltip>
        </div>
      </div>

      {preferences.showNewConversation ? (
        <div style={{ padding: wide ? "2px 10px 8px" : "2px 6px 8px" }}>
          <Tooltip label={t("session.new.label")} delayMs={500} disabled={wide}>
            <button
              type="button"
              aria-label={t("session.new.label")}
              aria-keyshortcuts={newSessionShortcut?.aria}
              onClick={() => startSession()}
              style={{
                width: "100%",
                minHeight: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: wide ? "flex-start" : "center",
                gap: 8,
                padding: wide ? "0 10px" : 0,
                border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
                borderRadius: 9,
                background: "color-mix(in srgb, currentColor 6%, transparent)",
                color: "inherit",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {wide ? (
                <IconNewChatOutlineMedium size={15} />
              ) : (
                <IconNewChatOutlineRegular size={18} />
              )}
              {wide ? <span>{t("session.new")}</span> : null}
              {wide && newSessionShortcut !== undefined && newSessionShortcut.keys.length > 0 ? (
                <span aria-hidden="true" style={{ marginLeft: "auto" }}>
                  <ShortcutKeys keys={newSessionShortcut.keys} />
                </span>
              ) : null}
            </button>
          </Tooltip>
        </div>
      ) : null}

      {panels.length > 0 ? (
        <nav
          aria-label={PANELS_LABEL}
          style={{ display: "grid", gap: 2, padding: wide ? "0 10px" : "0 6px" }}
        >
          {panels.map(({ id, label }) => (
            <SidebarPanelRow
              key={id}
              id={id}
              label={label}
              wide={wide}
              usePanelInfo={usePanelInfo}
              selectPanel={selectPanel}
              renderSlot={renderSlot}
            />
          ))}
        </nav>
      ) : null}

      <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
        {preferences.showFiles
          ? renderSlot("sidebar.workspaces", {
              wide,
              expandSidebar: () => {
                if (collapsed) toggleSidebar();
              },
            })
          : null}
      </div>

      <div style={{ flexShrink: 0, padding: wide ? "8px 10px 10px" : "8px 6px 10px" }}>
        <div style={{ display: "grid", gap: 2 }}>
          {renderSlot("sidebar.footer.action", { wide })}
        </div>
        <div style={{ marginTop: 2 }}>{renderSlot("sidebar.settings", { wide })}</div>
      </div>
    </aside>
  );
}
