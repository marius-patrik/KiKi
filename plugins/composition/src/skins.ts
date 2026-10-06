import type { SkinDefinition } from "./workspace.js";

export const builtinSkins: readonly SkinDefinition[] = [
  {
    id: "deepseek",
    displayName: "DeepSeek",
    logoAssetId: "brand/deepseek/logo",
    sidebarBranding: {
      collapsedAssetId: "brand/deepseek/logo-mark",
      expandedAssetId: "brand/deepseek/logo",
    },
  },
  {
    id: "claude",
    displayName: "Claude",
    logoAssetId: "brand/claude/logo",
    sidebarBranding: {
      collapsedAssetId: "brand/claude/logo-mark",
      expandedAssetId: "brand/claude/logo",
    },
  },
  {
    id: "codex",
    displayName: "Codex",
    logoAssetId: "brand/codex/logo",
    sidebarBranding: {
      collapsedAssetId: "brand/codex/logo-mark",
      expandedAssetId: "brand/codex/logo",
    },
  },
];
