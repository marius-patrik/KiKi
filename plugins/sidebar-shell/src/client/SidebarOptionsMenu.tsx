import { useState } from "react";
import {
  IconPersonalizationOutlineMedium,
  Menu,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

/** The one entry the Stack sidebar options menu carries. */
const SHOW_FILES_ITEM = "show-files";

/**
 * The sidebar options button and its menu.
 *
 * The menu carries exactly one entry: a checkable `Show files` toggle over the
 * sidebar's file/workspace tree region. It deliberately carries no bulk
 * session action -- the options button is a view control, not a place from
 * which sessions are archived.
 */
export function SidebarOptionsMenu({
  showFiles,
  onShowFilesChange,
}: {
  /** Whether the file/workspace tree region is currently rendered. */
  showFiles: boolean;
  /** Requests the opposite file-region visibility. */
  onShowFilesChange: (showFiles: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={[{ id: SHOW_FILES_ITEM, label: "Show files" }]}
      selectedIds={showFiles ? [SHOW_FILES_ITEM] : []}
      onSelect={(id) => {
        if (id === SHOW_FILES_ITEM) onShowFilesChange(!showFiles);
        setOpen(false);
      }}
      align="end"
      dense
      // The sidebar column clips overflow, so an in-place list would be cropped.
      portal
      anchor={
        <Tooltip label="Sidebar options" delayMs={500}>
          <button
            type="button"
            aria-label="Sidebar options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              border: 0,
              borderRadius: 8,
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <IconPersonalizationOutlineMedium />
          </button>
        </Tooltip>
      }
    />
  );
}
