/**
 * Type contract for the Appearance section's `settings.appearance.tab` seat.
 *
 * Appearance is the one settings destination for everything that changes how
 * the Stack looks, but the things it shows are owned by four different
 * packages: the theme studio (`@dsh-stack/tweaks`, which also owns the section
 * and the shell around it), the theme directory (`@dsh-stack/themes`), the
 * icon catalog (`@dsh-stack/providers`) and the skin picker
 * (`@dsh-stack/skin-settings`). Rather than have the section import and
 * re-render three other packages' components, it declares this seat and
 * renders whatever registers into it — the same arrangement the harness
 * already uses for `settings.plugins.tab`, and the same one the settings shell
 * itself uses for `settings.section`.
 *
 * The shell's Appearance section is hand-authored JavaScript and carries no
 * TypeScript face, so the SlotMap augmentation lives here, in the package
 * every Stack settings registrant already depends on -- the arrangement
 * `./section-icon-slot.ts` documents for the nav-glyph seat.
 *
 * @module @dsh-stack/settings-panel/appearance-tab-slot
 */
import type {} from "@deepseek-ai/dsh-client-ui-slots";

/**
 * Owner share of one Appearance tab. The section owns tab selection and the
 * tab strip; a tab draws its own body and receives the same `close` affordance
 * a top-level section gets, so a tab that used to be its own section keeps
 * whatever close action it already rendered.
 */
export interface SettingsAppearanceTabOwnerProps {
  /** Close the settings panel (the shell owns the open state). */
  close: () => void;
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    /**
     * One page inside the Appearance settings section. Options carry the tab
     * identity: `id` (tab key, drives `only` filtering), `order` (tab
     * position) and `label` (registrant-owned tab text). Declared at runtime
     * by the Appearance section; registrants never depend on one another.
     */
    "settings.appearance.tab": {
      kind: "list";
      scope: "root";
      owner: SettingsAppearanceTabOwnerProps;
    };
  }
}

/**
 * The seat's slot key, re-exported so registrants name it once instead of
 * repeating the string literal at every `inject`/`register` pair.
 */
export const SETTINGS_APPEARANCE_TAB_SLOT = "settings.appearance.tab" as const;
