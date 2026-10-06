import { browserSessionCookieHeader, readBrowserSessionSecret } from "./browser-session-cookie.js";
import { readProfilePort } from "./ports.js";

/**
 * Shape of one plugin entry in a `pluginInventory/list` RPC response.
 * `fiberPhase` is genuinely `null` on the wire for entries the harness has
 * not instantiated yet (e.g. tool/skill entries not yet invoked) -- not a
 * failure state, and distinct from `"pending"` (a fiber stuck waiting on an
 * injected service that never arrived, which the harness docs call out as a
 * real silent failure).
 */
export interface PluginInventoryEntry {
  entryId: string;
  moduleName: string;
  fiberPhase: string | null;
}

/**
 * Extract the plugin entries from a decoded `pluginInventory/list` response
 * body. Returns null when the body is not a successful inventory result, so
 * callers can distinguish "server answered with nothing usable" from an empty
 * inventory.
 */
export function parsePluginInventory(body: unknown): PluginInventoryEntry[] | null {
  if (typeof body !== "object" || body === null || !("result" in body)) return null;
  const result = (body as { result?: { ok?: boolean; value?: { entries?: unknown } } }).result;
  if (result?.ok !== true || !Array.isArray(result.value?.entries)) return null;
  return result.value.entries as PluginInventoryEntry[];
}

/**
 * Query the running server's plugin inventory over its Typert HTTP RPC on
 * `port` (the gateway port, from resolvePort), authenticated the same way a
 * browser tab is: harness's boot flow has required a signed `dsh-auth-*`
 * cookie on every `/api/*` request since the harness bump in #218, so this
 * mints one locally from `home`'s stored browser-session secret (see
 * browser-session-cookie.ts) rather than guessing at an unauthenticated
 * request.
 *
 * The cookie's signed authority is NOT `port`: the gateway proxies to the
 * webserver plugin's own configured port and the auth layer binds the
 * cookie to that upstream Host, observed directly against a real server --
 * a cookie minted for the gateway port is rejected even though the gateway
 * is what the client actually dials. `profile`'s `cordis.patch.yml` names
 * that port (readProfilePort); `port` itself is the fallback when no patch
 * pins one (e.g. a bare profile with no webserver entry).
 *
 * Returns null when the server does not answer within `timeoutMs` (three
 * seconds by default), the secret isn't readable (a pre-#218 home, or the
 * file is genuinely missing), or the response body is unusable.
 */
export async function fetchPluginInventory(
  port: number,
  home: string,
  profile: string,
  timeoutMs = 3000,
): Promise<PluginInventoryEntry[] | null> {
  try {
    const authorityPort = readProfilePort(home, profile) ?? port;
    const authority = `127.0.0.1:${String(authorityPort)}`;
    const secret = await readBrowserSessionSecret(home);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret !== undefined) headers.Cookie = browserSessionCookieHeader(secret, authority);
    const res = await fetch(`http://127.0.0.1:${String(port)}/api/pluginInventory/list`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "client-request",
        rpcId: "status",
        method: "pluginInventory/list",
        payload: { args: {} },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return parsePluginInventory(await res.json());
  } catch {
    return null;
  }
}
