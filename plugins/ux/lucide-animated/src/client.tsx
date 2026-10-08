import type { ComponentType, HTMLAttributes } from "react";
import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CircleX,
  Code,
  Container,
  Copy,
  Database,
  Download,
  Ellipsis,
  File,
  FileCode2,
  FileCog,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  House,
  Info,
  Layers,
  Lock,
  LockKeyhole,
  Menu,
  Minus,
  Package,
  Palette,
  PanelLeft,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  Square,
  Terminal,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

const styleId = "dsh-stack-lucide-animated-styles";

/** ensureAnimationStyles implementation. */
function ensureAnimationStyles(): void {
  if (typeof document === "undefined" || document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    @keyframes dsh-lucide-bounce { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.08); } }
    @keyframes dsh-lucide-spin { from { transform: rotate(0deg) scale(1); } to { transform: rotate(360deg) scale(1.04); } }
    @keyframes dsh-lucide-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: .72; } }
    @keyframes dsh-lucide-nudge { 0%,100% { transform: translateX(0) scale(1); } 50% { transform: translateX(2px) scale(1.05); } }
    @media (prefers-reduced-motion: reduce) { .dsh-lucide-animated { animation: none !important; } }
  `;
  document.head.appendChild(style);
}

type AnimationMode = "bounce" | "spin" | "pulse" | "nudge";
type AnimatedIconProps = Omit<HTMLAttributes<HTMLSpanElement>, "color"> &
  Pick<LucideProps, "color" | "strokeWidth"> & { size?: number | string };

/** makeAnimatedIcon implementation. */
function makeAnimatedIcon(Icon: LucideIcon, mode: AnimationMode): LucideIcon {
  return forwardRef<HTMLSpanElement, AnimatedIconProps>(
    ({ className, size = 18, color, strokeWidth, style, ...props }, ref) => {
      ensureAnimationStyles();
      return (
        <span
          ref={ref}
          {...props}
          className={["dsh-lucide-animated", className].filter(Boolean).join(" ")}
          style={{
            display: "inline-flex",
            lineHeight: 0,
            animation: `dsh-lucide-${mode} 1.6s ease-in-out infinite`,
            transformOrigin: "center",
            ...style,
          }}
        >
          <Icon aria-hidden="true" color={color} size={size} strokeWidth={strokeWidth} />
        </span>
      );
    },
  ) as unknown as LucideIcon;
}

export const PlusIcon = makeAnimatedIcon(Plus, "bounce");
export const XIcon = makeAnimatedIcon(X, "spin");
export const SearchIcon = makeAnimatedIcon(Search, "nudge");
export const SettingsIcon = makeAnimatedIcon(Settings, "spin");
export const RefreshCwIcon = makeAnimatedIcon(RefreshCw, "spin");
export const MenuIcon = makeAnimatedIcon(Menu, "nudge");
export const EllipsisIcon = makeAnimatedIcon(Ellipsis, "pulse");
export const PencilIcon = makeAnimatedIcon(Pencil, "nudge");
export const Trash2Icon = makeAnimatedIcon(Trash2, "bounce");
export const DownloadIcon = makeAnimatedIcon(Download, "bounce");
export const UploadIcon = makeAnimatedIcon(Upload, "bounce");
export const SaveIcon = makeAnimatedIcon(Save, "bounce");
export const CopyIcon = makeAnimatedIcon(Copy, "nudge");
export const SendIcon = makeAnimatedIcon(Send, "bounce");
export const Share2Icon = makeAnimatedIcon(Share2, "nudge");
export const PlayIcon = makeAnimatedIcon(Play, "bounce");
export const PauseIcon = makeAnimatedIcon(Pause, "pulse");
export const SquareIcon = makeAnimatedIcon(Square, "pulse");
export const TerminalIcon = makeAnimatedIcon(Terminal, "nudge");
export const HouseIcon = makeAnimatedIcon(House, "bounce");
export const FolderIcon = makeAnimatedIcon(Folder, "nudge");
export const FolderOpenIcon = makeAnimatedIcon(FolderOpen, "bounce");
export const FileIcon = makeAnimatedIcon(File, "nudge");
export const CodeIcon = makeAnimatedIcon(Code, "nudge");
export const TriangleAlertIcon = makeAnimatedIcon(TriangleAlert, "pulse");
export const CircleXIcon = makeAnimatedIcon(CircleX, "pulse");
export const InfoIcon = makeAnimatedIcon(Info, "pulse");
export const CircleHelpIcon = makeAnimatedIcon(CircleHelp, "pulse");
export const LockIcon = makeAnimatedIcon(Lock, "bounce");
export const CheckIcon = makeAnimatedIcon(Check, "bounce");
export const ArrowLeftIcon = makeAnimatedIcon(ArrowLeft, "nudge");
export const ArrowRightIcon = makeAnimatedIcon(ArrowRight, "nudge");
export const ChevronRightIcon = makeAnimatedIcon(ChevronRight, "nudge");
export const ChevronLeftIcon = makeAnimatedIcon(ChevronLeft, "nudge");
export const ChevronDownIcon = makeAnimatedIcon(ChevronDown, "bounce");
export const ChevronUpIcon = makeAnimatedIcon(ChevronUp, "bounce");
export const MinusIcon = makeAnimatedIcon(Minus, "nudge");
export const FileCode2Icon = makeAnimatedIcon(FileCode2, "nudge");
export const FileSpreadsheetIcon = makeAnimatedIcon(FileSpreadsheet, "bounce");
export const FileJson2Icon = makeAnimatedIcon(FileJson2, "nudge");
export const FileTextIcon = makeAnimatedIcon(FileText, "bounce");
export const FileTerminalIcon = makeAnimatedIcon(FileTerminal, "nudge");
export const DatabaseIcon = makeAnimatedIcon(Database, "pulse");
export const FileImageIcon = makeAnimatedIcon(FileImage, "bounce");
export const FileCogIcon = makeAnimatedIcon(FileCog, "spin");
export const GitBranchIcon = makeAnimatedIcon(GitBranch, "nudge");
export const ContainerIcon = makeAnimatedIcon(Container, "bounce");
export const PackageIcon = makeAnimatedIcon(Package, "bounce");
export const LockKeyholeIcon = makeAnimatedIcon(LockKeyhole, "bounce");
export const PanelLeftIcon = makeAnimatedIcon(PanelLeft, "nudge");
export const PaletteIcon = makeAnimatedIcon(Palette, "pulse");
export const LayersIcon = makeAnimatedIcon(Layers, "bounce");

export const iconComponents: Readonly<Record<string, ComponentType<LucideProps>>> = {
  PlusIcon,
  XIcon,
  SearchIcon,
  SettingsIcon,
  RefreshCwIcon,
  MenuIcon,
  EllipsisIcon,
  PencilIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
  SaveIcon,
  CopyIcon,
  SendIcon,
  Share2Icon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  TerminalIcon,
  HouseIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  CodeIcon,
  TriangleAlertIcon,
  CircleXIcon,
  InfoIcon,
  CircleHelpIcon,
  LockIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  FileCode2Icon,
  FileSpreadsheetIcon,
  FileJson2Icon,
  FileTextIcon,
  FileTerminalIcon,
  DatabaseIcon,
  FileImageIcon,
  FileCogIcon,
  GitBranchIcon,
  ContainerIcon,
  PackageIcon,
  LockKeyholeIcon,
  PanelLeftIcon,
  PaletteIcon,
  LayersIcon,
};
