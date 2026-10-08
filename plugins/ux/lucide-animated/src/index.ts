import type { IconPack } from "@dsh-stack/icon-engine";

export const name = "lucide-animated";
export const version = "0.1.0";
export const priority = 1000;

const semanticIcons: Readonly<Record<string, string>> = {
  "ui:add": "PlusIcon",
  "ui:close": "XIcon",
  "ui:search": "SearchIcon",
  "ui:settings": "SettingsIcon",
  "ui:refresh": "RefreshCwIcon",
  "ui:menu": "MenuIcon",
  "ui:more": "EllipsisIcon",
  "ui:edit": "PencilIcon",
  "ui:delete": "Trash2Icon",
  "ui:download": "DownloadIcon",
  "ui:upload": "UploadIcon",
  "ui:save": "SaveIcon",
  "ui:copy": "CopyIcon",
  "ui:send": "SendIcon",
  "ui:share": "Share2Icon",
  "ui:play": "PlayIcon",
  "ui:pause": "PauseIcon",
  "ui:stop": "SquareIcon",
  "ui:terminal": "TerminalIcon",
  "ui:home": "HouseIcon",
  "ui:folder": "FolderIcon",
  "ui:folder-open": "FolderOpenIcon",
  "ui:file": "FileIcon",
  "ui:code": "CodeIcon",
  "ui:warning": "TriangleAlertIcon",
  "ui:error": "CircleXIcon",
  "ui:info": "InfoIcon",
  "ui:help": "CircleHelpIcon",
  "ui:lock": "LockIcon",
  "ui:check": "CheckIcon",
  "ui:back": "ArrowLeftIcon",
  "ui:forward": "ArrowRightIcon",
  "ui:next": "ChevronRightIcon",
  "ui:previous": "ChevronLeftIcon",
  "ui:down": "ChevronDownIcon",
  "ui:up": "ChevronUpIcon",
  "ui:remove": "MinusIcon",
  "ui:sidebar": "PanelLeftIcon",
  "ui:palette": "PaletteIcon",
  "ui:layers": "LayersIcon",
};

const extensionIcons: Readonly<Record<string, string>> = {
  ts: "FileCode2Icon",
  tsx: "FileCode2Icon",
  js: "FileCode2Icon",
  jsx: "FileCode2Icon",
  mjs: "FileCode2Icon",
  cjs: "FileCode2Icon",
  json: "FileJson2Icon",
  jsonc: "FileJson2Icon",
  csv: "FileSpreadsheetIcon",
  xls: "FileSpreadsheetIcon",
  xlsx: "FileSpreadsheetIcon",
  md: "FileTextIcon",
  mdx: "FileTextIcon",
  txt: "FileTextIcon",
  sh: "FileTerminalIcon",
  bash: "FileTerminalIcon",
  zsh: "FileTerminalIcon",
  sql: "DatabaseIcon",
  db: "DatabaseIcon",
  sqlite: "DatabaseIcon",
  png: "FileImageIcon",
  jpg: "FileImageIcon",
  jpeg: "FileImageIcon",
  webp: "FileImageIcon",
  svg: "FileImageIcon",
  lock: "LockKeyholeIcon",
};

const fileIcons: Readonly<Record<string, string>> = {
  "package.json": "PackageIcon",
  "package-lock.json": "PackageIcon",
  "pnpm-lock.yaml": "PackageIcon",
  "bun.lock": "PackageIcon",
  "bun.lockb": "PackageIcon",
  Dockerfile: "ContainerIcon",
  ".gitignore": "GitBranchIcon",
  ".gitmodules": "GitBranchIcon",
};

/** Normalize a file-extension token for case-insensitive icon lookup. */
function normalizeExtension(value: string): string {
  return value.startsWith(".") ? value.slice(1).toLowerCase() : value.toLowerCase();
}

/** Resolve a semantic icon key to the corresponding Lucide icon component name. */
export function resolveIcon(key: string): string | null {
  const [kind, ...parts] = key.split(":");
  const value = parts.join(":");

  if (kind === "ui") return semanticIcons[key] ?? null;
  if (kind === "file") return fileIcons[value] ?? "FileIcon";
  if (kind === "extension") return extensionIcons[normalizeExtension(value)] ?? "FileIcon";
  if (kind === "language") {
    const language = value.toLowerCase();
    if (
      language === "typescript" ||
      language === "javascript" ||
      language === "tsx" ||
      language === "jsx"
    )
      return "FileCode2Icon";
    if (language === "json") return "FileJson2Icon";
    if (language === "sql") return "DatabaseIcon";
    if (language === "shellscript" || language === "shell") return "FileTerminalIcon";
    return "CodeIcon";
  }
  if (kind === "folder" || kind === "root") {
    const folder = value.startsWith("expanded:")
      ? value.slice("expanded:".length)
      : value.startsWith("collapsed:")
        ? value.slice("collapsed:".length)
        : value;
    return folder ? (value.startsWith("expanded:") ? "FolderOpenIcon" : "FolderIcon") : null;
  }
  return null;
}

/** Create the Lucide Animated icon-pack descriptor. */
export function createPack(): IconPack {
  return {
    id: "lucide-animated",
    label: "Lucide Animated",
    priority,
    resolve: resolveIcon,
  };
}

/** Register the Lucide Animated pack with the host icon-pack registry. */
export function register(packRegistry: { registerPack(pack: IconPack): void }): void {
  packRegistry.registerPack(createPack());
}
