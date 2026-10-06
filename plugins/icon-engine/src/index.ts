import type { Context } from "@deepseek-ai/cordis";

export const name = "icon-engine";
export const inject: readonly string[] = [];
export const optional: readonly string[] = [];

export interface IconPack {
  readonly id: string;
  readonly label: string;
  readonly priority?: number;
  readonly resolve: (key: string) => string | null;
}

export interface IconRequest {
  readonly fileName?: string;
  readonly extension?: string;
  readonly languageId?: string;
  readonly folderName?: string;
  readonly isRoot?: boolean;
  readonly expanded?: boolean;
}

export class IconEngine {
  private readonly packs = new Map<string, IconPack>();

  /**
   * Registers an icon pack.
   *
   * @param pack - The icon pack to register.
   * @throws Will throw an error if the pack ID is already registered.
   * @returns Nothing.
   */
  registerPack(pack: IconPack): void {
    if (this.packs.has(pack.id)) throw new Error(`Icon pack already registered: ${pack.id}`);
    this.packs.set(pack.id, pack);
  }

  /**
   * Removes an icon pack by its ID if it exists.
   *
   * @param id - The ID of the icon pack to remove.
   * @returns `true` if the pack was successfully removed; `false` if the pack was not found.
   */
  removePack(id: string): boolean {
    return this.packs.delete(id);
  }

  /**
   * Returns a sorted list of registered icon packs.
   *
   * @returns A sorted array of `IconPack` instances, ordered by priority descending.
   */
  packsList(): readonly IconPack[] {
    return [...this.packs.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /** resolve implementation. */
  resolve(request: IconRequest): string {
    const packs = this.packsList();
    for (const key of keysFor(request)) {
      for (const pack of packs) {
        const icon = pack.resolve(key);
        if (icon) return icon;
      }
    }
    return "file";
  }
}

/** keysFor implementation. */
function keysFor(request: IconRequest): readonly string[] {
  const keys: string[] = [];
  if (request.fileName) keys.push(`file:${request.fileName}`);
  if (request.isRoot && request.folderName) {
    keys.push(`root:${request.expanded ? "expanded" : "collapsed"}:${request.folderName}`);
  }
  if (request.folderName) {
    keys.push(`folder:${request.expanded ? "expanded" : "collapsed"}:${request.folderName}`);
    keys.push(`folder:${request.folderName}`);
  }
  if (request.languageId) keys.push(`language:${request.languageId}`);
  if (request.extension) {
    const extension = request.extension.startsWith(".")
      ? request.extension.slice(1)
      : request.extension;
    keys.push(`extension:${extension.toLowerCase()}`);
  }
  return keys;
}

/**
 * Provides an IconEngine to the context, indicating the availability of icons.
 *
 * Guarantees that the `stack.icons` service is registered with an IconEngine.
 *
 * On failure, does nothing and leaves the context unchanged.
 */
export function apply(ctx: Context): void {
  ctx.provide("stack.icons", new IconEngine());
}
