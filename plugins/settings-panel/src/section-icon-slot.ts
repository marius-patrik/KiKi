/**
 * Type contract for the settings shell's `settings.section.icon` seat.
 *
 * The seat is declared at runtime by the settings shell (`@dsh-stack/tweaks`,
 * as a child of `sidebar.settings`) and filled by whichever plugin owns the
 * matching `settings.section` entry: one glyph per section id. The shell's
 * bundle is hand-authored JavaScript and carries no TypeScript face, so the
 * SlotMap augmentation lives here, in the package every Stack settings-section
 * registrant already depends on -- the same arrangement the harness uses for
 * `settings.plugins.tab`, whose type sits in the common dependency rather than
 * in the entry that declares it.
 *
 * @module @dsh-stack/settings-panel/section-icon-slot
 */
import type {} from "@deepseek-ai/dsh-client-ui-slots";

/**
 * Owner share of a section glyph. The shell renders the nav cell and passes
 * nothing: the glyph draws itself at its own size, inheriting `currentColor`
 * from the nav row so selection and hover states stay the shell's business.
 */
export interface SettingsSectionIconOwnerProps {
  /** Marker field: glyph owner props are intentionally empty. */
  children?: never;
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    /**
     * One nav glyph per settings section, keyed by the section's `id`. A
     * section with no entry here falls back to the shell's own mark for that
     * id, so the nav never renders a blank cell.
     */
    "settings.section.icon": {
      kind: "list";
      scope: "root";
      owner: SettingsSectionIconOwnerProps;
    };
  }
}

/**
 * The seat's slot key, re-exported so registrants name it once instead of
 * repeating the string literal at every `inject`/`register` pair.
 */
export const SETTINGS_SECTION_ICON_SLOT = "settings.section.icon" as const;
