# sidebar-shell

The Stack sidebar shell and its client-side slot integration.

The shell is the single occupant of the layout-owned `sidebar` slot, so it owns
the column geometry, the brand row, the New Session action, the global panel
navigation and the foot. It declares the seats it renders — `sidebar.brand.mark`,
`sidebar.brand.name`, `sidebar.toggle.badge`, `sidebar.panellist`,
`sidebar.workspaces`, `sidebar.settings` and `sidebar.footer.action` — and every
other surface plugs into one of those seats rather than into the column itself.

## Injected face

`apply` supplies the four members the shell contract requires:

- `startSession` delegates to the Workspace browser's navigation service
  (`uiWorkspace`), which owns reuse-or-create for a workspace's blank session.
- `toggleSidebar` and `selectPanel` are the two layout-service actions; panel
  selection goes through `ctx.layout`, so the row and the main column can never
  disagree about which panel is active.
- `hooks.panels` is a snapshot store projected from the live `sidebar.panellist`
  ledger (id, order, registrant-resolved label), refreshed on slot mutation and
  on locale change. The shell renders one row per entry and each row subscribes
  to its own selection state, so selecting one panel re-renders one row.
- `hooks.shortcuts` is the shortcut command catalog, bound to the New Session
  button's keycap and accessible combination and to the column-toggle button.

## View controls

The shell header carries the sidebar options button. Its menu is a view control
and holds exactly one entry — a `Show files` toggle over the file/workspace tree
region (`sidebar.workspaces`). The choice is persisted through
`@dsh-stack/sidebar-preferences`, so it survives reloads and stays in sync with
the same toggle in the Sidebar settings section.