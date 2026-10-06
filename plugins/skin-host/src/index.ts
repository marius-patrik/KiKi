export const name = "skin-host";
export const version = "0.1.0";
export const supportedSkins = ["deepseek", "claude", "codex"] as const;

/**
 * Host loader entry for the browser-only skin host plugin: mounting it puts
 * the package on the loader's entry list so the client-modules scanner picks
 * up its `dsh.client` bundle.
 */
export function apply(): void {}
