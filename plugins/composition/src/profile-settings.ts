import type { ProfileDefinition } from "./types.js";

export interface ProfileSelectorState {
  readonly activeProfileId: string;
  readonly availableProfiles: readonly ProfileDefinition[];
}

export interface ProfileSettingsTab {
  readonly id: "profiles";
  readonly title: "Profiles";
  readonly description: "Choose and configure the active Stack profile.";
}

export const profilesSettingsTab: ProfileSettingsTab = {
  id: "profiles",
  title: "Profiles",
  description: "Choose and configure the active Stack profile.",
};

/**
 * Creates a ProfileSelectorState with the active profile and available profiles.
 *
 * @param activeProfileId - The ID of the currently active profile.
 * @param profiles - An array of ProfileDefinition objects representing available profiles.
 * @returns A ProfileSelectorState object containing the active profile ID and available profiles.
 * @throws Will throw an error if the active profile ID is not found in the available profiles.
 */
export function createProfileSelectorState(
  activeProfileId: string,
  profiles: readonly ProfileDefinition[],
): ProfileSelectorState {
  if (!profiles.some((profile) => profile.id === activeProfileId)) {
    throw new Error(`Unknown active Stack profile: ${activeProfileId}`);
  }
  return {
    activeProfileId,
    availableProfiles: profiles,
  };
}
