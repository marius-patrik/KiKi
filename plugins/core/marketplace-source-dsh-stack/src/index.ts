/**
 * The `dsh-stack` marketplace source extension: a concrete
 * `MarketplaceSource` plugging into the `marketplace` registry abstraction
 * (`@dsh-stack/marketplace`), listing this repo's own release catalog as
 * installable entries.
 * @module marketplace-source-dsh-stack
 */

import type { Context } from "@deepseek-ai/cordis";
import type { DshStackMarketplaceSourceOptions } from "./source.js";
import { createDshStackMarketplaceSource } from "./source.js";

export type { DshStackMarketplaceSourceOptions } from "./source.js";
export { createDshStackMarketplaceSource, manifestToEntries, SOURCE_ID } from "./source.js";
export type {
  GithubRelease,
  GithubReleaseAsset,
  StackReleaseManifest,
  StackReleaseManifestPackage,
} from "./github-release.js";

export const name = "marketplace-source-dsh-stack";
export const inject = ["marketplace"];

/**
 * apply implementation. Registers the `dsh-stack` source against the
 * marketplace registry. `config` is optional and lets a deployment override
 * which repo to read from or inject a custom `fetch` (e.g. through an
 * authenticated proxy for a private mirror); it is never required for
 * normal use.
 */
export function apply(ctx: Context, config?: DshStackMarketplaceSourceOptions): void {
  ctx.marketplace.register(createDshStackMarketplaceSource(config));
}
