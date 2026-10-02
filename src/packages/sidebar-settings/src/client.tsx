import { useEffect, useState } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { SettingsSectionOwnerProps } from "@deepseek-ai/dsh-client-ui-settings/client";
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import {
  SETTINGS_SECTION_ICON_SLOT,
  SettingsSection,
  SettingsToggleRow,
} from "@dsh-stack/settings-panel";
import { PanelLeftIcon } from "@dsh-stack/lucide-animated/client";
import type { SidebarPreferences, SidebarPreferenceKey } from "@dsh-stack/sidebar-preferences";
import type {} from "@dsh-stack/sidebar-preferences/client";

/** Cordis client services this plugin's `apply` reaches for; activation waits on them. */
export const inject = ["slots", "sidebarPreferences"];

type SidebarSettingsProps = SettingsSectionOwnerProps & {
  preferences: ClientContext["sidebarPreferences"];
};

/** Renders the sidebar settings section. */
export function SidebarSettings({ preferences, close }: SidebarSettingsProps) {
  const [state, setState] = useState<SidebarPreferences>(preferences.get());
  useEffect(() => preferences.subscribe(() => setState(preferences.get())), [preferences]);
  const /** change implementation. */
    change = (key: SidebarPreferenceKey, value: boolean) => preferences.set(key, value);
  return (
    <SettingsSection
      label="Sidebar"
      title="Sidebar"
      description="Choose which elements the DSH Stack sidebar shell renders."
      onClose={close}
    >
      <SettingsToggleRow
        id="sidebar-show-brand-logo"
        label="Show brand logo"
        description="Show the active skin's logo."
        checked={state.showBrandLogo}
        onChange={(value) => change("showBrandLogo", value)}
      />
      <SettingsToggleRow
        id="sidebar-show-new-conversation"
        label="Show New Conversation"
        description="Show the New Conversation action."
        checked={state.showNewConversation}
        onChange={(value) => change("showNewConversation", value)}
      />
      <SettingsToggleRow
        id="sidebar-show-files"
        label="Show files"
        description="Show the file/workspace tree region."
        checked={state.showFiles}
        onChange={(value) => change("showFiles", value)}
      />
      <SettingsToggleRow
        id="sidebar-tree-layout-unified"
        label="Combine sidebar sections into one tree"
        description="Render Pinned, Containers, Terminals, Host Machine, Global and Archived as one continuous tree instead of separate sections."
        checked={state.treeLayout === "unified"}
        onChange={(value) => preferences.set("treeLayout", value ? "unified" : "sections")}
      />
    </SettingsSection>
  );
}

/** Renders the Sidebar section's nav glyph from the canonical animated icon set. */
export function SidebarSettingsIcon() {
  return <PanelLeftIcon aria-hidden="true" size={16} />;
}

/** Registers the sidebar settings section with the settings slot registry. */
export function apply(ctx: ClientContext): void {
  const preferences = ctx.sidebarPreferences;
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      { name: "settings.section", id: "sidebar", order: 30, label: "Sidebar", inject: () => ({}) },
      (props: SettingsSectionOwnerProps) => (
        <SidebarSettings {...props} preferences={preferences} />
      ),
    ),
  );
  ctx.slots.inject(SETTINGS_SECTION_ICON_SLOT, () =>
    ctx.slots.register(
      { name: SETTINGS_SECTION_ICON_SLOT, id: "sidebar", order: 0 },
      SidebarSettingsIcon,
    ),
  );
}
