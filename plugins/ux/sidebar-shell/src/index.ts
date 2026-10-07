export const name = "sidebar-shell";

/**
 * Host loader entry for the browser-only sidebar shell plugin: mounting it
 * puts the package on the loader's entry list so the client-modules scanner
 * picks up its `dsh.client` bundle.
 */
export function apply(): void {}
