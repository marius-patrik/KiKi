import type { Context } from "@deepseek-ai/cordis";
import { createSkinRuntime, type SkinRuntime } from "./index.js";

export { defaultSkins, type SkinId, type SkinOption } from "./index.js";
export type { SkinRuntime };

export const inject: readonly string[] = [];

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The page's single skin runtime instance; owned here so every surface shares one active skin and one storage fallback. */
    skin: SkinRuntime;
  }
}

/** Provides the page's single shared skin runtime instance. */
export function apply(ctx: Context): void {
  ctx.provide(
    "skin",
    createSkinRuntime(undefined, () => window.location.reload()),
  );
}
