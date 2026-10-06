export const name = "stack-profiles";
export const version = "0.1.0";

/**
 * Host loader entry for the browser-only profile UI plugin: mounting it puts
 * the package on the loader's entry list so the client-modules scanner picks
 * up its `dsh.client` bundle.
 */
export function apply(): void {}

export const profileOptions = [
  { id: "default", label: "Default" },
  { id: "coding", label: "Coding" },
  { id: "trading", label: "Trading" },
  { id: "skyblock", label: "SkyBlock" },
] as const;
