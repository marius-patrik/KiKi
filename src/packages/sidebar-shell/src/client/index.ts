import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type {
  SidebarPanelMetadata,
  SidebarRootComponentProps,
  SidebarRootInjected,
} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type { UiWorkspace } from "@deepseek-ai/dsh-client-ui-workspace/client";
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from "@deepseek-ai/dsh-client-locale/client";
// Type-only: pulls the shortcut command service merge (ctx.shortcuts).
import type {} from "@deepseek-ai/dsh-client-shortcuts/client";
import { resolveSlotLabel } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@dsh-stack/sidebar-preferences/client";
import { SidebarRoot } from "./SidebarRoot.js";

export const inject = [
  "slots",
  "layout",
  "uiWorkspace",
  "locale",
  "shortcuts",
  "sidebarPreferences",
];

/**
 * The Workspace browser's New Session action, as the sidebar shell consumes it.
 *
 * `startSession` is the Workspace UI's own action: 0.2.0 moved it off the
 * Workspace Controller (`ctx.workspaces`) onto the `uiWorkspace` navigation
 * service, which does not merge itself into the cordis `Context` interface, so
 * this plugin narrows the resolved service to the single method it calls.
 */
type WorkspaceNavigation = Pick<UiWorkspace, "startSession">;

/** Register the stack sidebar shell into the layout sidebar slot. */
export function apply(ctx: ClientContext): void {
  const preferences = ctx.sidebarPreferences;
  const workspaceNavigation = ctx.get("uiWorkspace") as unknown as WorkspaceNavigation;

  const panels = createSnapshotStore<readonly SidebarPanelMetadata[]>([]);

  /**
   * Republish the global panel rows from the ledger of `sidebar.panellist`
   * entries, keeping registration order stable so a re-projection with no
   * change leaves the snapshot reference (and the shell's render) alone.
   */
  const syncPanels = (): void => {
    const next = ctx.slots
      .entriesOfSlot("sidebar.panellist")
      .map(({ options }) => {
        // The list registration requires an id; the stored entry erases the slot kind.
        const id = options.id as MainPanelId;
        return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id };
      })
      .sort((a, b) => a.order - b.order);
    const previous = panels.getSnapshot();
    const unchanged =
      previous.length === next.length &&
      previous.every((panel, index) => {
        const candidate = next[index] as SidebarPanelMetadata;
        return (
          panel.id === candidate.id &&
          panel.order === candidate.order &&
          panel.label === candidate.label
        );
      });
    if (unchanged) return;
    panels.set(next);
  };

  ctx.effect(
    () => ctx.slots.subscribe("sidebar.panellist", syncPanels),
    "stack-sidebar: panel entries",
  );
  ctx.effect(() => ctx.locale.subscribe(syncPanels), "stack-sidebar: panel labels");

  /**
   * Registers the stack sidebar shell into the layout sidebar slot.
   *
   * Supplies the four callbacks the shell contract requires — start a session,
   * toggle the column, select a global panel, and the two reactive sources the
   * shell reads (`sidebar.panellist` metadata and the shortcut catalog) — plus
   * the seats it declares for the regions it renders.
   *
   * @returns the registrant's injected face for the sidebar entry.
   */
  const injectProps = (): SidebarRootInjected => ({
    startSession: (workspaceId) => workspaceNavigation.startSession(workspaceId),
    toggleSidebar: () => ctx.layout.toggleSidebar(),
    selectPanel: (id) => {
      ctx.layout.selectPanel(id);
    },
    hooks: { panels, shortcuts: ctx.shortcuts.catalog },
  });

  ctx.effect(
    () =>
      ctx.slots.register(
        {
          name: "sidebar",
          locale: "sidebar",
          children: {
            "sidebar.brand.mark": { kind: "single", scope: "root" },
            "sidebar.brand.name": { kind: "single", scope: "root" },
            "sidebar.toggle.badge": { kind: "single", scope: "root" },
            "sidebar.panellist": { kind: "list", scope: "root" },
            "sidebar.workspaces": { kind: "single", scope: "root" },
            "sidebar.settings": { kind: "single", scope: "root" },
            "sidebar.footer.action": { kind: "list", scope: "root" },
          },
          inject: injectProps,
        },
        (props: SidebarRootComponentProps) =>
          SidebarRoot({ ...props, sidebarPreferences: preferences }),
      ),
    "stack-sidebar: slot registration",
  );
  syncPanels();
}
