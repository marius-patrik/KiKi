export interface SidebarLogoState {
  readonly showBrandLogo: boolean;
  readonly collapsed: boolean;
  readonly assetId: string;
}

export interface SidebarSettings {
  /** One setting controls the brand mark in both sidebar states. */
  readonly showBrandLogo: boolean;
}

export interface SidebarConversationSettings {
  /** Controls the large New Conversation action in the sidebar. */
  readonly showNewConversation: boolean;
}

export interface SkinDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly logoAssetId: string;
  readonly darkLogoAssetId?: string;
  readonly lightLogoAssetId?: string;
  readonly sidebarBranding?: {
    readonly collapsedAssetId?: string;
    readonly expandedAssetId?: string;
  };
}

export interface WorkspaceThemeState {
  readonly activeSkinId: string;
  readonly skins: readonly SkinDefinition[];
}

/**
 * Determines the state of the sidebar logo based on the settings, skin definition, and sidebar state.
 *
 * Returns the logo state including whether to show the brand logo, the sidebar's collapsed state, and the asset ID.
 *
 * @param settings - The configuration settings for the sidebar.
 * @param skin - The skin definition providing branding assets.
 * @param collapsed - Indicates if the sidebar is collapsed.
 * @returns The logo state object indicating the brand logo visibility, sidebar state, and asset ID.
 */
export function resolveSidebarLogo(
  settings: SidebarSettings,
  skin: SkinDefinition,
  collapsed: boolean,
): SidebarLogoState {
  const surface = skin.sidebarBranding;
  const assetId = collapsed
    ? (surface?.collapsedAssetId ?? skin.logoAssetId)
    : (surface?.expandedAssetId ?? skin.logoAssetId);

  return {
    showBrandLogo: settings.showBrandLogo,
    collapsed,
    assetId,
  };
}

/**
 * Returns true if the new conversation should be shown based on the provided settings.
 *
 * @param settings - The settings defining the visibility of new conversations.
 * @returns true if new conversations should be shown; otherwise, false.
 */
export function shouldShowNewConversation(settings: SidebarConversationSettings): boolean {
  return settings.showNewConversation;
}
