export type FileNodeKind = "file" | "directory" | "workspace" | "repository";

export type FileRowAction =
  | "open"
  | "open-new-tab"
  | "reveal"
  | "copy-path"
  | "rename"
  | "duplicate"
  | "delete";

export interface FileNode {
  readonly id: string;
  readonly kind: FileNodeKind;
  readonly name: string;
  readonly path: string;
  readonly parentId?: string;
  readonly hidden?: boolean;
}

export interface FileRowModel extends FileNode {
  readonly actions: readonly FileRowAction[];
  readonly iconRequest: {
    readonly fileName?: string;
    readonly extension?: string;
    readonly languageId?: string;
    readonly folderName?: string;
    readonly isRoot?: boolean;
    readonly expanded?: boolean;
  };
}

export const defaultFileRowActions: readonly FileRowAction[] = [
  "open",
  "open-new-tab",
  "reveal",
  "copy-path",
  "rename",
  "duplicate",
  "delete",
];

export interface FileSection {
  readonly id: "pinned" | "active" | "host-root" | "container-root" | "ungrouped" | "archived";
  readonly label: string;
  readonly iconTone: "default" | "muted";
}

// jscpd:ignore-start -- index/tab-building mirrors composition/src/sidebar.ts's shape for a different domain; not extracted to keep each package's export self-contained
export const defaultFileSections: readonly FileSection[] = [
  { id: "pinned", label: "Pinned", iconTone: "default" },
  { id: "active", label: "Active", iconTone: "default" },
  { id: "host-root", label: "Host Root", iconTone: "muted" },
  { id: "container-root", label: "Container", iconTone: "muted" },
  { id: "ungrouped", label: "Ungrouped", iconTone: "muted" },
  { id: "archived", label: "Archived", iconTone: "muted" },
];

/** createFileRow implementation. */
export function createFileRow(node: FileNode, expanded = false): FileRowModel {
  // jscpd:ignore-end
  const extension = extensionOf(node.name);
  const folder =
    node.kind === "directory" || node.kind === "workspace" || node.kind === "repository"
      ? node.name
      : undefined;
  return {
    ...node,
    actions: [...defaultFileRowActions],
    iconRequest: {
      fileName: node.kind === "file" ? node.name : undefined,
      extension: extension ?? undefined,
      folderName: folder,
      isRoot: node.kind === "workspace" || node.kind === "repository",
      expanded,
    },
  };
}

/**
 * Returns the extension of the given file name if it contains exactly one dot.
 * @param name - The file name to extract the extension from.
 * @returns The lowercased extension if present; otherwise, undefined.
 */
function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}
