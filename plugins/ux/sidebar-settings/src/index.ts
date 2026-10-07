export const name = "sidebar-settings";
export const version = "0.1.0";

/**
 * Host loader entry for the browser-only sidebar settings plugin: mounting it
 * puts the package on the loader's entry list so the client-modules scanner
 * picks up its `dsh.client` bundle.
 */
export function apply(): void {}
