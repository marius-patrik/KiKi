/**
 * The vault-facing slice of a provider route registry.
 *
 * In Andromeda, the supervisor resolves OAuth refresh configurations from a
 * hardcoded built-in descriptor table. This plugin already has a provider
 * registry (`ctx.providers`, populated by `@dsh-stack/provider-<id>` extensions) — so the table is not ported;
 * instead this module is an *injected* adapter over whatever route registry the
 * composition root registers, which is how `providers` is wired in without
 * credentials depending on it (their peer dependency runs the other way).
 *
 * Two sources, both injected:
 *
 * - `registerProviderRoutes` records which provider ids exist and whether each
 *   authenticates with an api key or OAuth. Any array shaped like
 *   `providers`' `ProviderRoute` (id, displayName, authKind) satisfies the
 *   structural type, so this module never imports the plugin.
 * - `registerOAuthSupplement` supplies the refresh-capable OAuth endpoints for
 *   the OAuth routes. Each provider route carries the wire facts (dialect, base
 *   url, credential refs) but not OAuth authorization-server endpoints, so
 *   those arrive here, validated by the same https-or-loopback rule the
 *   descriptor schema enforced.
 *
 * `auth` is null exactly when the vault has no refresh protocol to speak for a
 * provider: an api-key route has nothing to refresh, and an OAuth route without
 * a supplement entry is a session whose renewal the vault cannot drive — the
 * supervisor answers "expired_without_refresh_path" for both, which is the
 * honest outcome for imported subscription tokens.
 *
 * Not part of the Andromeda port; new for this plugin (the injected-adapter
 * form of `built-in.ts`'s `findProviderDescriptor`).
 * @module credentials/vault/provider-descriptor
 */

import type { OAuthAuthConfig } from "./descriptor.js";
import { parseOAuthEndpointUrl } from "./descriptor.js";

/** The minimal route facts the adapter needs. `providers`' `ProviderRoute` satisfies this. */
export interface ProviderRouteLike {
  id: string;
  displayName: string;
  authKind: "api-key" | "oauth";
  /** Default endpoint, `{model}`-substituted on the wire. Contributes to the host allow-list. */
  baseURL?: string;
}

/**
 * How an api-key route attaches its key on the wire. The route registry carries
 * only `authKind`; the header is the dialect's generic default. Per-record
 * material (`header`, `auth:` tags) still wins when present — see
 * `tools.ts`'s `authPlacementFor`.
 */
export interface ProviderApiKeyAuth {
  method: "api_key";
  header: string;
  prefix: string;
}

/** The auth facts the vault reasons about: an api-key placement or an OAuth refresh protocol. */
export type ProviderAuth = ProviderApiKeyAuth | OAuthAuthConfig;

/** What the supervisor and the toolset are allowed to know about a provider. */
export interface ProviderAuthDescriptor {
  id: string;
  displayName: string;
  /** The route's default endpoint; its host is allowed for this provider's records. */
  baseUrl: string;
  /** Advisory model catalog. `providers` routes carry static lists, so there is no endpoint URL to add. */
  modelCatalog: { kind: "static" } | { kind: "list_endpoint"; url: string };
  /**
   * The refresh-capable OAuth configuration, the api-key placement, or null.
   * Null exactly when the vault has no protocol to speak for a provider: an
   * OAuth route without a supplement entry is a session whose renewal the vault
   * cannot drive, and `tools.ts`/`supervisor.ts` answer
   * "expired_without_refresh_path"/"auth_placement_unknown" for those.
   */
  auth: ProviderAuth | null;
}

const routes = new Map<string, ProviderRouteLike>();
let supplement: ReadonlyMap<string, OAuthAuthConfig> = new Map();

/**
 * Record the provider routes this vault can reason about. Idempotent per route
 * id; later registrations overwrite earlier ones, so a composition root can
 * re-register after reloading settings.
 */
export function registerProviderRoutes(added: readonly ProviderRouteLike[]): void {
  for (const route of added) routes.set(route.id, route);
}

/**
 * Supply the OAuth endpoint configurations for the OAuth routes. Every
 * endpoint is validated with the descriptor schema's scheme rule — https, or
 * http on a loopback host — so a configuration whose token endpoint could leak
 * a refresh token on the wire is rejected at registration, not at first use.
 */
export function registerOAuthSupplement(entries: Record<string, OAuthAuthConfig>): void {
  const validated = new Map<string, OAuthAuthConfig>();
  for (const [id, auth] of Object.entries(entries)) {
    const tokenUrl = parseOAuthEndpointUrl(auth.tokenUrl);
    if (!tokenUrl)
      throw new Error(`provider ${id}: oauth tokenUrl is not an https (or loopback http) url`);
    const authorizationUrl =
      auth.method === "oauth_pkce"
        ? parseOAuthEndpointUrl(auth.authorizeUrl)
        : parseOAuthEndpointUrl(auth.deviceAuthorizationUrl);
    if (!authorizationUrl) {
      throw new Error(
        `provider ${id}: oauth ${auth.method === "oauth_pkce" ? "authorizeUrl" : "deviceAuthorizationUrl"} is not an https (or loopback http) url`,
      );
    }
    validated.set(id, auth);
  }
  supplement = validated;
}

/** Look up a provider by id, or null when it is not a known route. */
export function findProviderDescriptor(id: string): ProviderAuthDescriptor | null {
  const route = routes.get(id);
  if (!route) return null;
  const auth: ProviderAuth | null =
    route.authKind === "api-key"
      ? { method: "api_key", header: "Authorization", prefix: "Bearer " }
      : (supplement.get(route.id) ?? null);
  return {
    id: route.id,
    displayName: route.displayName,
    baseUrl: route.baseURL ?? "",
    modelCatalog: { kind: "static" },
    auth,
  };
}
