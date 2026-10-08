# @dsh-stack/settings-panel

The canonical shape of a DSH Stack settings section.

Every Stack settings section renders the same furniture: a titled header with a
description, a vertical grid of options, selectable rows, and a close action.
Before this package each section hand-rolled that shape with inline styles —
`sidebar-settings`, `skin-settings` and `profile-ui` each carried their own
copy. The copies drifted (different border tokens, different type scales), and
the duplication was suppressed with `jscpd:ignore` markers rather than removed,
which `.agents/AGENTS.md` forbids: there is exactly one implementation owner for
every feature.

This package is that owner. Sections compose it and contribute only their own
content.

## Exports

| Export | Renders |
| --- | --- |
| `SettingsSection` | section frame: accessible label, header with title and description, and an option grid |
| `SettingsOptionRow` | one selectable option row with a checkmark when selected — skins, profiles |
| `SettingsToggleRow` | one labelled option row with a description and a checkbox — sidebar preferences |
| `SettingsCloseButton` | the section's close action |

## Slot seats

Two settings slots are declared at runtime by hand-authored JavaScript that
carries no TypeScript face, so their `SlotMap` types live here — in the package
every Stack settings registrant already depends on.

| Export | Seat | Filled by |
| --- | --- | --- |
| `SETTINGS_SECTION_ICON_SLOT` | `settings.section.icon` — one nav glyph per settings section, keyed by section id | whichever plugin owns the matching `settings.section` entry |
| `SETTINGS_APPEARANCE_TAB_SLOT` | `settings.appearance.tab` — one page inside the Appearance section | the packages owning the theme studio, skins, icons and themes |

`settings.appearance.tab` is what makes Appearance a single settings
destination without its owner importing the three feature packages whose pages
it shows; see `.agents/notes/decisions/settings-section-composition.md`.

## Usage

```tsx
import {
  SettingsSection,
  SettingsOptionRow,
  SettingsCloseButton,
} from "@dsh-stack/settings-panel";

<SettingsSection
  label="Skins"
  title="Skins"
  description="Change the DSH Stack visual identity."
  onClose={close}
>
  {skins.map((skin) => (
    <SettingsOptionRow
      key={skin.id}
      label={skin.label}
      selected={skin.id === active}
      onSelect={() => setActive(skin.id)}
    />
  ))}
</SettingsSection>
```

`SettingsSection` renders `SettingsCloseButton` itself when given `onClose`.

## Styling

Presentation lives here as inline style objects, matching how the surrounding
Stack settings surfaces are written today; there is no CSS-module build step in
this layer. Colours are expressed with `color-mix(in srgb, currentColor …)` so a
section inherits the host shell's palette and stays correct under every skin
without importing theme tokens.
