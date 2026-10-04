import { useState } from "react";
import { Menu } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { SettingsSectionOwnerProps } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { SidebarFooterActionOwnerProps } from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import {
  SETTINGS_SECTION_ICON_SLOT,
  SettingsSection,
  SettingsOptionRow,
} from "@dsh-stack/settings-panel";
import { CheckIcon, LayersIcon, SettingsIcon } from "@dsh-stack/lucide-animated/client";
import { createProfileRuntime } from "@dsh-stack/profile-runtime";
import { profileOptions } from "../index.js";

const runtime = createProfileRuntime(profileOptions, { reload: () => window.location.reload() });
export const inject = ["slots"];

/** Render the compact or expanded profile selector in the sidebar footer. */
function ProfileSelector({ wide }: SidebarFooterActionOwnerProps) {
  const [open, setOpen] = useState(false);
  const active = runtime.getActive();
  const activeOption = profileOptions.find((option) => option.id === active) ?? profileOptions[0]!;
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={profileOptions.map((option) => ({ id: option.id, label: option.label }))}
      selectedIds={[activeOption.id]}
      onSelect={(id) => {
        setOpen(false);
        runtime.setActive(id);
      }}
      align="start"
      dense
      portal
      anchor={
        <button
          type="button"
          aria-label="Switch profile"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          title={activeOption.label}
          style={{
            width: "100%",
            minHeight: 34,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: wide ? "0 10px" : 0,
            justifyContent: wide ? "flex-start" : "center",
            border: 0,
            borderRadius: 8,
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <SettingsIcon aria-hidden="true" size={18} />
          {wide ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeOption.label}
            </span>
          ) : null}
        </button>
      }
    />
  );
}

/** Render the profile selection section inside the settings surface. */
function ProfileSettings({ close }: SettingsSectionOwnerProps) {
  const [active, setActive] = useState(runtime.getActive());
  return (
    <SettingsSection
      label="Profiles"
      title="Profiles"
      description="Switch the active Stack composition. The new profile is applied after the interface reloads."
      onClose={close}
    >
      {profileOptions.map((option) => (
        <SettingsOptionRow
          key={option.id}
          label={option.label}
          selected={option.id === active}
          onSelect={() => {
            setActive(option.id);
            runtime.setActive(option.id);
          }}
          selectedMark={<CheckIcon aria-hidden="true" size={18} />}
        />
      ))}
    </SettingsSection>
  );
}

/** Renders the Profiles section's nav glyph from the canonical animated icon set. */
function ProfileSettingsIcon() {
  return <LayersIcon aria-hidden="true" size={16} />;
}

/** Mount the profile selector and settings section into the client slot registry. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register({ name: "sidebar.footer.action", id: "profiles" }, ProfileSelector),
  );
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "profiles",
        order: 40,
        label: "Profiles",
        inject: () => ({}),
      },
      ProfileSettings,
    ),
  );
  ctx.slots.inject(SETTINGS_SECTION_ICON_SLOT, () =>
    ctx.slots.register(
      { name: SETTINGS_SECTION_ICON_SLOT, id: "profiles", order: 0 },
      ProfileSettingsIcon,
    ),
  );
}
