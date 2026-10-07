export interface ProfileOption {
  readonly id: string;
  readonly label: string;
}

export interface ProfileRuntimeOptions {
  readonly storageKey?: string;
  readonly reload?: () => void;
}

export interface ProfileRuntime {
  readonly options: readonly ProfileOption[];
  getActive(): string;
  setActive(profileId: string): void;
  isBrowserPersisted(): boolean;
}

const DEFAULT_KEY = "dsh-stack.profile";

/**
 * Creates a ProfileRuntime instance based on the provided options and runtime options.
 *
 * @param options - An array of ProfileOption objects defining the profiles.
 * @param runtimeOptions - Runtime options including the storage key.
 * @returns A ProfileRuntime instance representing the active profile.
 * @throws Throws an error if no profiles are provided.
 */
export function createProfileRuntime(
  options: readonly ProfileOption[],
  runtimeOptions: ProfileRuntimeOptions = {},
): ProfileRuntime {
  if (options.length === 0) throw new Error("At least one Stack profile is required");
  const byId = new Set(options.map((option) => option.id));
  const storageKey = runtimeOptions.storageKey ?? DEFAULT_KEY;
  let active = options[0]!.id;
  const storage =
    typeof globalThis === "object" && "localStorage" in globalThis
      ? (() => {
          try {
            return globalThis.localStorage;
          } catch {
            return undefined;
          }
        })()
      : undefined;

  if (storage) {
    try {
      const stored = storage.getItem(storageKey);
      if (stored && byId.has(stored)) active = stored;
    } catch {
      // Browsers may expose localStorage but block access in privacy modes.
    }
  }

  return {
    options,
    getActive: () => active,
    setActive: (profileId) => {
      if (!byId.has(profileId)) throw new Error(`Unknown Stack profile: ${profileId}`);
      if (active === profileId) return;
      active = profileId;
      try {
        storage?.setItem(storageKey, profileId);
      } catch {
        // Persisting is best-effort; the runtime remains correct for this page.
      }
      runtimeOptions.reload?.();
    },
    isBrowserPersisted: () => storage !== undefined,
  };
}
