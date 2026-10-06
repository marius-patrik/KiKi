import { useEffect, useState } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import {
  SETTINGS_APPEARANCE_TAB_SLOT,
  type SettingsAppearanceTabOwnerProps,
  SettingsSection,
  SettingsOptionRow,
} from "@dsh-stack/settings-panel";
import { defaultSkins, type SkinId, type SkinRuntime } from "@dsh-stack/skin-runtime";
import type {} from "@dsh-stack/skin-runtime/client";

/** Cordis client services this plugin's `apply` reaches for; activation waits on them. */
export const inject = ["slots", "skin"];

/** SkinSettings implementation. */
export function SkinSettings({
  runtime,
  close,
}: SettingsAppearanceTabOwnerProps & { runtime: SkinRuntime }) {
  const [active, setActive] = useState<SkinId>(runtime.getActive());
  useEffect(() => runtime.subscribe(() => setActive(runtime.getActive())), [runtime]);

  return (
    <SettingsSection
      label="Skins"
      title="Skins"
      description="Change the DSH Stack visual identity. The selected skin controls branding assets without changing the sidebar implementation."
      onClose={close}
    >
      {defaultSkins.map((skin) => (
        <SettingsOptionRow
          key={skin.id}
          label={skin.label}
          selected={active === skin.id}
          onSelect={() => {
            setActive(skin.id);
            runtime.setActive(skin.id);
          }}
        />
      ))}
    </SettingsSection>
  );
}

/**
 * Registers the skin picker as one page of the Appearance section.
 *
 * The picker is not a settings section of its own: it contributes to the
 * `settings.appearance.tab` seat that section declares, so skins sit beside
 * themes and icons under one Appearance entry without this package and the
 * section's owner importing anything from each other.
 * @param ctx - the client context supplying the skin runtime and slot registry.
 */
export function apply(ctx: ClientContext): void {
  const runtime = ctx.skin;
  ctx.slots.inject(SETTINGS_APPEARANCE_TAB_SLOT, () =>
    ctx.slots.register(
      { name: SETTINGS_APPEARANCE_TAB_SLOT, id: "skins", order: 10, label: "Skins" },
      (props: SettingsAppearanceTabOwnerProps) => <SkinSettings {...props} runtime={runtime} />,
    ),
  );
}
