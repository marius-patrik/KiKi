/**
 * The `dsh-stack` marketplace source: the Stack's own release catalog,
 * plugged into the `marketplace` registry abstraction
 * (`@dsh-stack/marketplace`). Its source of truth is the GitHub Releases API
 * for `marius-patrik/dsh-stack` — the latest release's `stack-release.json`
 * manifest asset (produced by `src/scripts/release.mjs manifest`), which is
 * the same manifest a real installer/auto-updater would consume (per #49's
 * "Auto-update" scope). Fetching is injected as `fetchImpl` (defaulting to
 * the platform `fetch`) purely so this extension's own tests can exercise
 * real listing/mapping logic against a canned response instead of requiring
 * live network access from a sandboxed CI/dev environment; the extension
 * itself never bundles a fixture catalog as if it were live data.
 * @module marketplace-source-dsh-stack/source
 */

import type { MarketplaceEntry, MarketplaceSource } from "@dsh-stack/marketplace";
import type { GithubRelease, StackReleaseManifest } from "./github-release.js";

/** This source's id, as registered against the marketplace registry. */
export const SOURCE_ID = "dsh-stack";

/** The manifest asset name `src/scripts/release.mjs manifest` writes. */
const MANIFEST_ASSET_NAME = "stack-release.json";

/** Options controlling which repo/release this source reads and how it fetches. */
export interface DshStackMarketplaceSourceOptions {
  /** The GitHub `owner/repo` slug to read releases from. Defaults to this repo, `"marius-patrik/dsh-stack"`. */
  readonly repo?: string;
  /** The fetch implementation to use. Defaults to the platform global `fetch`. Overridable for testing without live network access. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Fetch the given repo's latest GitHub Release metadata.
 * @throws when the request does not succeed.
 */
async function fetchLatestRelease(repo: string, fetchImpl: typeof fetch): Promise<GithubRelease> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(
      `marketplace-source-dsh-stack: GitHub Releases request for ${repo} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as GithubRelease;
}

/**
 * Fetch and parse the `stack-release.json` manifest asset attached to the
 * given release.
 * @throws when the release has no such asset, or the asset does not fetch.
 */
async function fetchManifest(
  release: GithubRelease,
  fetchImpl: typeof fetch,
): Promise<StackReleaseManifest> {
  const asset = release.assets.find((candidate) => candidate.name === MANIFEST_ASSET_NAME);
  if (asset === undefined) {
    throw new Error(
      `marketplace-source-dsh-stack: release ${release.tag_name} has no ${MANIFEST_ASSET_NAME} asset`,
    );
  }
  const response = await fetchImpl(asset.browser_download_url);
  if (!response.ok) {
    throw new Error(
      `marketplace-source-dsh-stack: fetching ${MANIFEST_ASSET_NAME} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as StackReleaseManifest;
}

/**
 * Map one release's manifest into marketplace entries, each pointing its
 * install source at that release's page. The manifest schema does not carry
 * a human-readable description per package (only `stack.json` does, and
 * `stack.json` is not part of the published release asset set), so
 * `description` is left empty here rather than fabricated.
 */
export function manifestToEntries(
  manifest: StackReleaseManifest,
  release: GithubRelease,
): MarketplaceEntry[] {
  return manifest.packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    version: pkg.version,
    kind: pkg.kind,
    description: "",
    dependencies: pkg.dependencies,
    optionalDependencies: pkg.optionalDependencies,
    install: { kind: "github-release", location: release.html_url },
  }));
}

/**
 * Create the `dsh-stack` marketplace source: on {@link MarketplaceSource.listEntries},
 * fetches the repo's latest GitHub Release, reads its `stack-release.json`
 * manifest asset, and maps it to marketplace entries.
 */
export function createDshStackMarketplaceSource(
  options: DshStackMarketplaceSourceOptions = {},
): MarketplaceSource {
  const repo = options.repo ?? "marius-patrik/dsh-stack";
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: SOURCE_ID,
    /**
     * Fetches and returns a list of marketplace entries.
     * Guarantees a successful promise resolution with an array of MarketplaceEntry objects.
     * On failure, rejects the promise with an error.
     */
    async listEntries(): Promise<MarketplaceEntry[]> {
      const release = await fetchLatestRelease(repo, fetchImpl);
      const manifest = await fetchManifest(release, fetchImpl);
      return manifestToEntries(manifest, release);
    },
  };
}
