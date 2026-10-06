import type { InjectFace, PropsRenderSlots, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  SidebarPanelMetadata,
  SidebarRootInjected,
  SidebarSectionOwnerProps,
} from "@deepseek-ai/dsh-client-ui-sidebar/client";

type SidebarPanelRowProps = Pick<SidebarPanelMetadata, "id" | "label"> &
  Pick<SidebarSectionOwnerProps, "wide"> &
  Pick<PropsRuntime<"sidebar">, "usePanelInfo"> &
  Pick<InjectFace<SidebarRootInjected>, "selectPanel"> &
  PropsRenderSlots<"sidebar.panellist">;

/**
 * One global panel row in the sidebar's panel navigation.
 *
 * The row subscribes to its own selection state rather than to the whole
 * layout snapshot, so selecting one panel re-renders that row alone. The
 * glyph comes from the panel's own `sidebar.panellist` entry, and the row's
 * label and accessible name both come from that entry's list metadata.
 *
 * @param props - the panel id, its registrant-resolved label, the column
 * state, the layout selection hook, the panel-selection action, and the
 * panel-list render share.
 * @returns the panel row element tree.
 */
export function SidebarPanelRow({
  id,
  label,
  wide,
  usePanelInfo,
  selectPanel,
  renderSlot,
}: SidebarPanelRowProps) {
  const active = usePanelInfo((info) => info.activePanelId === id);
  return (
    <Tooltip label={label} delayMs={500} disabled={wide}>
      <button
        type="button"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          selectPanel(id);
        }}
        style={{
          width: "100%",
          minHeight: 34,
          display: "flex",
          flexDirection: wide ? "row" : "column",
          alignItems: "center",
          justifyContent: wide ? "flex-start" : "center",
          gap: 8,
          padding: wide ? "0 10px" : 0,
          border: 0,
          borderRadius: 8,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            color: active ? "inherit" : "color-mix(in srgb, currentColor 68%, transparent)",
          }}
        >
          {renderSlot("sidebar.panellist", { size: wide ? 16 : 18, active }, { only: id })}
        </span>
        {wide ? (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}
