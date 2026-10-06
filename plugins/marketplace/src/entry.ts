/**
 * Marketplace entry and install-source types: the installable-unit shape a
 * {@link MarketplaceSource} produces. Deliberately aligned with the release
 * catalog schema `src/scripts/release.mjs manifest` writes to
 * `.release/stack-release.json` (`id`/`name`/`version`/`kind`/`dependencies`/
 * `optionalDependencies`), so a source that reads that manifest (or the
 * GitHub Release it is published as an asset of) needs no field mapping
 * beyond attaching an install location.
 * @module marketplace/entry
 */

/** The three installable Stack component kinds a marketplace entry may be, plus `library` for a non-installable shared dependency surfaced for dependency resolution. */
export type MarketplaceEntryKind = "plugin" | "extension" | "pack" | "library";

/** One dependency reference, matching `stack.json`'s `dependencies`/`optionalDependencies` shape as resolved onto a concrete version by the release manifest. */
export interface MarketplaceDependencyRef {
  /** The namespaced Stack id of the depended-on package (e.g. `stack.ai.providers`). */
  readonly id: string;
  /** The resolved version of that dependency at the time this entry's catalog was built, or `null` if it could not be resolved (e.g. a dependency outside the source's own catalog). */
  readonly version: string | null;
}

/** Where an installer fetches an entry's distributable artifact from. */
export interface MarketplaceInstallSource {
  /** The install mechanism: a GitHub Release asset, a registry package, or a local filesystem path (e.g. a dev-linked workspace package). */
  readonly kind: "github-release" | "registry" | "local-path";
  /** The mechanism-specific location: a release/tag URL, a registry package spec, or a filesystem path. */
  readonly location: string;
}

/**
 * One installable Stack plugin, extension, or pack as listed by a
 * marketplace source. Mirrors the release manifest's per-package catalog
 * entry shape plus the install location a source attaches.
 */
export interface MarketplaceEntry {
  /** The namespaced Stack id (`stack.json`'s `id`), globally unique across the catalog. */
  readonly id: string;
  /** The npm-style package name (`stack.json`'s `name`, `@dsh-stack/<id>`). */
  readonly name: string;
  /** The entry's semantic version. */
  readonly version: string;
  /** Which of the three composition-tree roles (or `library`) this entry is. */
  readonly kind: MarketplaceEntryKind;
  /** A human-readable summary of what this entry provides. May be empty when the source's catalog does not carry descriptions (the release manifest currently does not). */
  readonly description: string;
  /** Required dependencies that must also be installed. */
  readonly dependencies: readonly MarketplaceDependencyRef[];
  /** Optional dependencies that enhance this entry when present. */
  readonly optionalDependencies: readonly MarketplaceDependencyRef[];
  /** Where an installer retrieves this entry's distributable artifact from. */
  readonly install: MarketplaceInstallSource;
}

/** A {@link MarketplaceEntry} as returned by the aggregating registry, attributed to the source that contributed it. */
export interface MarketplaceCatalogEntry extends MarketplaceEntry {
  /** The id of the {@link MarketplaceSource} that contributed this entry. */
  readonly sourceId: string;
}
