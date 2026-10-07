# sidebar-preferences

Persistent preference state for the Stack sidebar UI.

Declares `dsh.client` and provides its single `sidebarPreferences` store as
the cordis `sidebarPreferences` service (`./client`). Consumers
(`sidebar-settings`, `sidebar-shell`, `providers`) inject `sidebarPreferences`
instead of importing the store as a value, so the page has one
change-listener set instead of one per bundle it used to be inlined into.

Preferences: `showBrandLogo`, `showNewConversation`, `showFiles`, and
`treeLayout` (`"sections"` | `"unified"`) -- whether the sidebar tree
(`@dsh-stack/providers`'s `sidebar.workspaces` component) renders its groups
as discrete sections or as one continuous tree (#103).
