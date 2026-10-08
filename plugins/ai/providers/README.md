# providers

Provider adapters, model catalogs, authentication seams, and quota integrations for DSH Stack.

## Sidebar tree

`client/sidebar-tree/` holds the sidebar tree the running UI renders -- its
groups (`Pinned`, `Containers`, `Terminals`, `Host Machine`, `Global`,
`Archived`), the rows they list, and the row context menus. It is the single
implementation owner of the sidebar tree (#138); `@dsh-stack/composition`'s
former `sidebar.ts` section-list contract, which nothing imported (#123), has
been deleted rather than kept in sync with it. The build concatenates the
directory ahead of `client.js`, the same way the shared glyph factory is
prepended, and `client.js` hands it the browser primitives (React, glyphs,
`SelectDropdownMenu`, the quotas API base) it draws with through one `runtime`
object per `sidebar-tree.js`'s factory.

One file per concern: `sidebar-tree.js` is the mounted component -- it owns
all React state and assembles the groups; `session-grouping.js` is the whole
pinned/containers/terminals/folder/global/archived classification rule (#96:
a busy chat renders once, in its normal group, not duplicated into a live
list); `tree-row.js` renders chat, subagent and archived-chat rows and their
menus; `live-process-row.js` renders the Containers/Terminals rows;
`tree-group.js` is the shared collapsible-group shell every section uses, in
either of the two layouts (`sections` / `unified`) `@dsh-stack/sidebar-preferences`
lets a user choose between (#103); `directory-entries.js` renders the Host
Machine filesystem tree; `new-item-menu.js` is the "+" button every group and
folder row shares; `row-actions-menu.js` is the ellipsis-trigger-plus-menu
pair every row kind with a context menu shares; `collapsed-rail.js` is the
narrow-sidebar rail view; `session-action-dispatch.js` runs rename/fork and
refuses to let one fail quietly (#98); `tree-notice.js` renders the failure
it surfaces; and `format-time-ago.js` is the row timestamp formatter.
