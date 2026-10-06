export const name = "skin-runtime";
export const inject: string[] = [];

/**
 * Host loader entry for the browser-only skin runtime plugin: mounting it
 * puts the package on the loader's entry list so the client-modules scanner
 * picks up its `dsh.client` bundle.
 */
export function apply(): void {}

export type SkinId = "deepseek" | "claude" | "codex";

export interface SkinOption {
  readonly id: SkinId;
  readonly label: string;
}

const STORAGE_KEY = "dsh-stack.ui.skin";

export const defaultSkins: readonly SkinOption[] = [
  { id: "deepseek", label: "DeepSeek" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
];

export interface SkinRuntime {
  getActive(): SkinId;
  setActive(id: SkinId): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Creates a skin runtime environment. Callers own exactly one instance per
 * page -- `@dsh-stack/skin-runtime`'s client plugin provides it as the
 * cordis `skin` service, so every surface shares one active skin and one
 * `localStorage`-unavailable fallback (see #108).
 *
 * @param options - An array of skin options, at least one of which is required.
 * @param reload - A function to reload the skin runtime.
 * @returns A SkinRuntime instance that manages skin activation.
 * @throws Will throw an error if no skins are provided or an unknown skin ID is set.
 */
export function createSkinRuntime(
  options: readonly SkinOption[] = defaultSkins,
  reload: () => void = () => undefined,
): SkinRuntime {
  if (options.length === 0) throw new Error("At least one skin is required");
  const allowed = new Set(options.map((skin) => skin.id));
  const fallback = options[0]!.id;
  const listeners = new Set<() => void>();
  /** In-memory mirror used when `localStorage` is unavailable (private mode, blocked site data). */
  let memorySkin: SkinId | undefined;

  /** Reads the persisted skin id, falling back to the in-memory mirror when storage is blocked. */
  const readStoredSkin = (): SkinId | undefined => {
    try {
      if (typeof localStorage !== "undefined") {
        const value = localStorage.getItem(STORAGE_KEY) as SkinId | null;
        if (value && allowed.has(value)) return value;
      }
    } catch {
      // Storage blocked (private mode etc.); fall through to the memory mirror.
    }
    return memorySkin;
  };

  return {
    getActive: () => readStoredSkin() ?? fallback,
    setActive: (id) => {
      if (!allowed.has(id)) throw new Error(`Unknown skin: ${id}`);
      if (id === (readStoredSkin() ?? fallback)) return;
      memorySkin = id;
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Storage is unavailable; the in-memory mirror above still updates
        // live subscribers for this page's lifetime.
      }
      for (const listener of listeners) listener();
      reload();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
