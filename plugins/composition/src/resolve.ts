import type { PackDefinition, PluginDefinition, ProfileDefinition } from "./types.js";

export interface CompositionCatalog {
  readonly plugins: ReadonlyMap<string, PluginDefinition>;
  readonly packs: ReadonlyMap<string, PackDefinition>;
  readonly profiles: ReadonlyMap<string, ProfileDefinition>;
}

export interface ResolvedComposition {
  readonly profile: ProfileDefinition;
  readonly packs: readonly PackDefinition[];
  readonly plugins: readonly PluginDefinition[];
}

/**
 * Resolves a profile from the catalog, ensuring all referenced packs and plugins are included.
 *
 * @param catalog - The CompositionCatalog containing profiles, packs, and plugins.
 * @param profileId - The ID of the profile to resolve.
 * @returns The ResolvedComposition containing the profile, packs, and resolved plugins.
 * @throws Will throw an error if the profile or any referenced pack is unknown.
 */
export function resolveProfile(
  catalog: CompositionCatalog,
  profileId: string,
): ResolvedComposition {
  const profile = catalog.profiles.get(profileId);
  if (!profile) throw new Error(`Unknown Stack profile: ${profileId}`);

  const selectedPackIds = new Set(profile.packs);
  const packs: PackDefinition[] = [];
  const selectedPluginIds = new Set(profile.plugins ?? []);

  for (const packId of selectedPackIds) {
    const pack = catalog.packs.get(packId);
    if (!pack) throw new Error(`Profile ${profileId} references unknown pack ${packId}`);
    packs.push(pack);
    for (const pluginId of pack.plugins) selectedPluginIds.add(pluginId);
  }

  const plugins = resolvePluginClosure(catalog.plugins, selectedPluginIds);
  return { profile, packs, plugins };
}

/**
 * Resolves the plugin closure for the given set of selected plugin IDs.
 *
 * Guarantees that it returns an array of PluginDefinition objects representing
 * the resolved plugin closure, ensuring no dependency cycles are present.
 * Throws an error if a dependency cycle is detected or an unknown plugin ID is encountered.
 *
 * @param registry - A map of plugin definitions.
 * @param selected - A set of selected plugin IDs to resolve.
 */
function resolvePluginClosure(
  registry: ReadonlyMap<string, PluginDefinition>,
  selected: ReadonlySet<string>,
): PluginDefinition[] {
  const resolved = new Map<string, PluginDefinition>();
  const visiting = new Set<string>();

  /**
   * Visits a plugin ID to resolve its dependencies.
   *
   * Guarantees that it adds the plugin definition to the resolved set if no cycles are detected.
   * Throws an error if a dependency cycle is detected or an unknown plugin ID is encountered.
   *
   * @param pluginId - The ID of the plugin to visit.
   */
  const visit = (pluginId: string): void => {
    if (resolved.has(pluginId)) return;
    if (visiting.has(pluginId)) throw new Error(`Plugin dependency cycle detected at ${pluginId}`);

    const plugin = registry.get(pluginId);
    if (!plugin) throw new Error(`Composition references unknown plugin ${pluginId}`);

    visiting.add(pluginId);
    for (const dependency of plugin.dependencies ?? []) {
      if (dependency.kind === "required") visit(dependency.plugin);
    }
    visiting.delete(pluginId);
    resolved.set(pluginId, plugin);
  };

  for (const pluginId of selected) visit(pluginId);

  for (const plugin of resolved.values()) {
    for (const dependency of plugin.dependencies ?? []) {
      if (dependency.kind === "optional" && !registry.has(dependency.plugin)) {
        throw new Error(
          `Plugin ${plugin.id} declares optional dependency ${dependency.plugin}, but it is unknown`,
        );
      }
    }
  }

  return [...resolved.values()];
}
