/**
 * Canonical settings-section furniture shared by every Stack settings surface.
 *
 * `sidebar-settings`, `skin-settings` and `profile-ui` each used to hand-roll
 * the same section frame, option grid and selectable row with inline styles.
 * The copies drifted apart and the duplication was suppressed with
 * `jscpd:ignore` markers instead of removed. This module is the single owner of
 * that shape; sections contribute only their own content.
 *
 * @module @dsh-stack/settings-panel
 */
import type { CSSProperties, ReactNode } from "react";

export { SETTINGS_SECTION_ICON_SLOT } from "./section-icon-slot.js";
export type { SettingsSectionIconOwnerProps } from "./section-icon-slot.js";
export { SETTINGS_APPEARANCE_TAB_SLOT } from "./appearance-tab-slot.js";
export type { SettingsAppearanceTabOwnerProps } from "./appearance-tab-slot.js";

/** Vertical rhythm between a section's option rows, in pixels. */
const OPTION_GAP = 8;

/** Height of a single option row, in pixels. */
const ROW_MIN_HEIGHT = 46;

/** Corner radius shared by every option row, in pixels. */
const ROW_RADIUS = 9;

/**
 * Hairline that reads correctly on any skin: it is derived from the inherited
 * text colour rather than a theme token, so a section stays legible wherever
 * the host shell mounts it.
 */
const ROW_BORDER = "1px solid color-mix(in srgb, currentColor 14%, transparent)";

/** Fill applied to the row representing the current selection. */
const ROW_SELECTED_BACKGROUND = "color-mix(in srgb, currentColor 7%, transparent)";

const sectionStyle: CSSProperties = { maxWidth: 720, display: "grid", gap: 18 };

const titleStyle: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 650 };

const descriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  lineHeight: 1.5,
  opacity: 0.68,
};

const optionGridStyle: CSSProperties = { display: "grid", gap: OPTION_GAP };

const rowBaseStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: ROW_MIN_HEIGHT,
  padding: "0 12px",
  borderRadius: ROW_RADIUS,
  border: ROW_BORDER,
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const rowLabelStackStyle: CSSProperties = { display: "grid", gap: 2 };

const rowLabelStyle: CSSProperties = { fontSize: 14 };

const rowDescriptionStyle: CSSProperties = { fontSize: 12, lineHeight: 1.4, opacity: 0.68 };

const closeButtonStyle: CSSProperties = { justifySelf: "start" };

export interface SettingsSectionProps {
  /** Accessible name for the section landmark. */
  readonly label: string;
  /** Heading shown at the top of the section. */
  readonly title: string;
  /** Supporting copy under the heading. */
  readonly description?: string;
  /** Option rows; rendered inside the shared option grid. */
  readonly children: ReactNode;
  /** Close handler; when supplied the section renders its own close action. */
  readonly onClose?: () => void;
  /** Label for the close action. */
  readonly closeLabel?: string;
}

/**
 * The frame every Stack settings section renders inside.
 * @param props - section content and close behaviour.
 * @returns the section landmark, header, option grid and close action.
 */
export function SettingsSection({
  label,
  title,
  description,
  children,
  onClose,
  closeLabel = "Close",
}: SettingsSectionProps) {
  return (
    <section aria-label={label} style={sectionStyle}>
      <header>
        <h2 style={titleStyle}>{title}</h2>
        {description === undefined ? null : <p style={descriptionStyle}>{description}</p>}
      </header>
      <div style={optionGridStyle}>{children}</div>
      {onClose === undefined ? null : <SettingsCloseButton label={closeLabel} onClose={onClose} />}
    </section>
  );
}

export interface SettingsOptionRowProps {
  /** Text shown on the row. */
  readonly label: string;
  /** Whether this row is the current selection. */
  readonly selected: boolean;
  /** Invoked when the row is chosen. */
  readonly onSelect: () => void;
  /**
   * Mark rendered on the selected row. Sections that own an icon set pass their
   * own glyph; the default keeps the row usable without one.
   */
  readonly selectedMark?: ReactNode;
}

/**
 * One selectable option in a settings section — a skin, a profile, a theme.
 * @param props - row label, selection state and select handler.
 * @returns a pressable row that marks itself when selected.
 */
export function SettingsOptionRow({
  label,
  selected,
  onSelect,
  selectedMark,
}: SettingsOptionRowProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...rowBaseStyle,
        background: selected ? ROW_SELECTED_BACKGROUND : "transparent",
      }}
    >
      <span style={rowLabelStyle}>{label}</span>
      {selected ? (selectedMark ?? <span aria-hidden="true">✓</span>) : null}
    </button>
  );
}

export interface SettingsToggleRowProps {
  /** Element id linking the row's label to its checkbox. */
  readonly id: string;
  /** Text shown on the row. */
  readonly label: string;
  /** Supporting copy under the label. */
  readonly description: string;
  /** Current value. */
  readonly checked: boolean;
  /** Invoked with the new value when the row is toggled. */
  readonly onChange: (value: boolean) => void;
}

/**
 * One boolean preference in a settings section.
 * @param props - row identity, copy, value and change handler.
 * @returns a labelled row wrapping a checkbox.
 */
export function SettingsToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: SettingsToggleRowProps) {
  return (
    <label htmlFor={id} style={{ ...rowBaseStyle, padding: "10px 12px" }}>
      <span style={rowLabelStackStyle}>
        <span style={rowLabelStyle}>{label}</span>
        <span style={rowDescriptionStyle}>{description}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export interface SettingsCloseButtonProps {
  /** Button text. */
  readonly label: string;
  /** Invoked when the button is pressed. */
  readonly onClose: () => void;
}

/**
 * The close action a settings section renders below its options.
 * @param props - button label and close handler.
 * @returns the close button.
 */
export function SettingsCloseButton({ label, onClose }: SettingsCloseButtonProps) {
  return (
    <button type="button" onClick={onClose} style={closeButtonStyle}>
      {label}
    </button>
  );
}
