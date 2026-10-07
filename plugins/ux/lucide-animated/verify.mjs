import assert from "node:assert/strict";
import { createPack, resolveIcon } from "./lib/index.js";
import { iconComponents } from "./lib/client.js";

const pack = createPack();
assert.equal(pack.id, "lucide-animated");
assert.equal(pack.priority, 1000);

const resolvedIcons = [
  "PlusIcon",
  "XIcon",
  "SearchIcon",
  "SettingsIcon",
  "RefreshCwIcon",
  "MenuIcon",
  "EllipsisIcon",
  "PencilIcon",
  "Trash2Icon",
  "DownloadIcon",
  "UploadIcon",
  "SaveIcon",
  "CopyIcon",
  "SendIcon",
  "Share2Icon",
  "PlayIcon",
  "PauseIcon",
  "SquareIcon",
  "TerminalIcon",
  "HouseIcon",
  "FolderIcon",
  "FolderOpenIcon",
  "FileIcon",
  "CodeIcon",
  "TriangleAlertIcon",
  "CircleXIcon",
  "InfoIcon",
  "CircleHelpIcon",
  "LockIcon",
  "CheckIcon",
  "ArrowLeftIcon",
  "ArrowRightIcon",
  "ChevronRightIcon",
  "ChevronLeftIcon",
  "ChevronDownIcon",
  "ChevronUpIcon",
  "MinusIcon",
  "FileCode2Icon",
  "FileSpreadsheetIcon",
  "FileJson2Icon",
  "FileTextIcon",
  "FileTerminalIcon",
  "DatabaseIcon",
  "FileImageIcon",
  "FileCogIcon",
  "GitBranchIcon",
  "ContainerIcon",
  "PackageIcon",
  "LockKeyholeIcon",
  "PanelLeftIcon",
  "PaletteIcon",
  "LayersIcon",
];

for (const icon of resolvedIcons) assert.equal(typeof iconComponents[icon], "object");
assert.equal(resolveIcon("ui:settings"), "SettingsIcon");
assert.equal(resolveIcon("ui:search"), "SearchIcon");
assert.equal(resolveIcon("ui:sidebar"), "PanelLeftIcon");
assert.equal(resolveIcon("ui:palette"), "PaletteIcon");
assert.equal(resolveIcon("ui:layers"), "LayersIcon");
assert.equal(resolveIcon("extension:ts"), "FileCode2Icon");
assert.equal(resolveIcon("folder:expanded:src"), "FolderOpenIcon");
assert.equal(resolveIcon("file:unknown.bin"), "FileIcon");
assert.equal(resolveIcon("language:typescript"), "FileCode2Icon");

console.log(
  `Lucide Animated pack verification passed (${resolvedIcons.length} concrete animated icons).`,
);
