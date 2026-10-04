/**
 * Minimal shapes this extension reads off the GitHub Releases API response
 * for a repo's latest release, and off the `stack-release.json` manifest
 * asset attached to that release (the manifest `src/scripts/release.mjs
 * manifest` produces — see `buildManifest()` there for the authoritative
 * shape; only the fields this extension consumes are declared here).
 * @module marketplace-source-dsh-stack/github-release
 */

/** One asset attached to a GitHub Release. */
export interface GithubReleaseAsset {
  /** The asset's file name, e.g. `"stack-release.json"`. */
  readonly name: string;
  /** The direct download URL for this asset's content. */
  readonly browser_download_url: string;
}

/** The subset of the GitHub Releases API "get latest release" response this extension consumes. */
export interface GithubRelease {
  /** The release's tag, e.g. `"v0.2.0"`. */
  readonly tag_name: string;
  /** The permalink to this release's page. */
  readonly html_url: string;
  /** Assets uploaded to this release. */
  readonly assets: readonly GithubReleaseAsset[];
}

/** One package entry from `stack-release.json`'s `packages` array (`buildManifest()` in `src/scripts/release.mjs`). */
export interface StackReleaseManifestPackage {
  /** The namespaced Stack id. */
  readonly id: string;
  /** The `@dsh-stack/<id>` package name. */
  readonly name: string;
  /** The package's semantic version. */
  readonly version: string;
  /** The package's composition-tree role. */
  readonly kind: "plugin" | "extension" | "pack" | "library";
  /** Required dependencies, each resolved onto a version within this same catalog. */
  readonly dependencies: readonly { id: string; version: string | null }[];
  /** Optional dependencies, each resolved onto a version within this same catalog. */
  readonly optionalDependencies: readonly { id: string; version: string | null }[];
}

/** The `stack-release.json` manifest shape this extension consumes. */
export interface StackReleaseManifest {
  /** The manifest schema format version. */
  readonly format: number;
  /** The complete catalog of packages this release contains. */
  readonly packages: readonly StackReleaseManifestPackage[];
}
