/**
 * OAuth configuration types for the vault's refresh protocols.
 *
 * Andromeda's `src/server/gateway/providers/descriptor.ts` defines the full
 * provider descriptor schema — auth, catalog, dialect, capabilities — validated
 * with zod. Only the OAuth configuration slice is ported here, because that is
 * all the vault consumes: the supervisor reads `auth.method` to decide whether a
 * record has a refresh protocol, and `oauth.ts` drives the two OAuth flows.
 *
 * Two deliberate reductions, both documented rather than silent:
 *
 * - The descriptor schema itself is not ported. Descriptors in Andromeda are
 *   parsed from source/config; in this plugin the OAuth configurations arrive
 *   programmatically through the provider-descriptor adapter, already typed, so
 *   re-validating them with a full schema would duplicate the type system. The
 *   one security-relevant rule that does survive is kept: OAuth endpoints must
 *   be https, or http on a loopback host (RFC 8252 §8.3's native-app
 *   exception), and the adapter validates every registered endpoint with
 *   `parseOAuthEndpointUrl`.
 * - The `auth.method` strings are the ones the supervisor and `oauth.ts` switch
 *   on, so `OAuthAuthConfig` is the two-member union rather than the full
 *   six-member auth enum (`none`, `api_key`, `external_command`, `aws_sigv4`
 *   are all "no OAuth refresh protocol" from the vault's seat, and are
 *   represented by `null` in the adapter).
 *
 * Endpoint semantics are ported verbatim: a plaintext token endpoint is a token
 * endpoint any on-path attacker can answer, and answering it with a 307 is how
 * a refresh token gets replayed somewhere else. The redirect wrapper refuses to
 * *follow* such a redirect; this refuses to be in a position to receive one.
 * @module credentials/vault/descriptor
 */

/** `127.0.0.0/8`, `::1` and `localhost` — RFC 8252's native-app exception. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Validate a URL an OAuth flow may send a credential to, or send the user's
 * browser to. https, or http on a loopback host. Null when the URL is
 * unusable, rather than throwing, so a caller can fold the result into an
 * error that names the offending configuration.
 */
export function parseOAuthEndpointUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url;
  return url.protocol === "http:" && isLoopbackHost(url.hostname) ? url : null;
}

/** An https (or loopback-http) OAuth endpoint, already validated. */
export type OAuthEndpoint = string;

/** A refresh-capable OAuth configuration for one provider. */
export interface OAuthPkceAuth {
  method: "oauth_pkce";
  authorizeUrl: OAuthEndpoint;
  tokenUrl: OAuthEndpoint;
  revokeUrl?: OAuthEndpoint;
  /** Public, non-secret client identifier: PKCE clients register no secret. */
  clientId: string;
  /**
   * Vault record id holding a client secret the token endpoint additionally
   * demands. A *record id*, never the secret.
   *
   * Present because "PKCE clients register no secret" is true of the
   * specification and false of Google. An installed-app OAuth client is issued
   * a `GOCSPX-…` secret and `oauth2.googleapis.com/token` rejects
   * `grant_type=refresh_token` without it, PKCE notwithstanding. RFC 8252 §8.5
   * acknowledges exactly this: such a secret is not confidential, because it is
   * extractable from any copy of the binary, and it is required all the same.
   * Omitted, refresh sends `client_id` alone, which is correct for every other
   * PKCE provider here.
   */
  clientSecretCredentialId?: string;
  scopes: readonly string[];
  /** `loopback` is the RFC 8252 native-app redirect; `hosted` bounces through a vendor page. */
  redirect: "loopback" | "hosted";
  redirectPath?: string;
  /** RFC 8414 authorization-server metadata document, for bring-your-own-IdP setups. */
  discoveryUrl?: OAuthEndpoint;
}

export interface OAuthDeviceAuth {
  method: "oauth_device";
  deviceAuthorizationUrl: OAuthEndpoint;
  tokenUrl: OAuthEndpoint;
  clientId: string;
  scopes: readonly string[];
  pollIntervalSeconds?: number;
}

/** The OAuth configurations `OAuthTokenRefresher` and the supervisor accept. */
export type OAuthAuthConfig = OAuthPkceAuth | OAuthDeviceAuth;
