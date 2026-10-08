/**
 * The GitHub OAuth route + refresh supplement for the vault adapter.
 *
 * `providers`' route registry carries the LLM wire routes; GitHub is not
 * an LLM provider, so it has no route there. This module registers the GitHub
 * credential route (`github` — the api.github.com target plus the OAuth
 * authorization server) through the same injected adapter
 * (`provider-descriptor.ts`) that the LLM routes use, so the vault treats a
 * GitHub token exactly like any other OAuth token: the host allow-list covers
 * api.github.com and the authorization server, and the supervisor can plan a
 * refresh when a record carries a refresh token.
 *
 * GitHub OAuth uses PKCE; a GitHub OAuth App issues a public client id. The
 * redirect is the RFC 8252 loopback (the `gh` CLI uses the same shape).
 *
 * @module credentials/github
 */

import type { OAuthPkceAuth } from "./vault/descriptor.js";
import { registerProviderRoutes, registerOAuthSupplement } from "./vault/provider-descriptor.js";

/** The GitHub OAuth authorization-server endpoints. */
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API_BASE = "https://api.github.com";

/** The scopes the GitHub OAuth App is asked for. */
export const GITHUB_DEFAULT_SCOPES: readonly string[] = ["repo", "workflow"];

/** Public (non-secret) client id of the GitHub OAuth App, when configured. */
export const GITHUB_CLIENT_ID = process.env["GITHUB_OAUTH_CLIENT_ID"] ?? "";

/**
 * Build the GitHub PKCE auth from a configured client id. GitHub requires a
 * real OAuth App; without one the route is still registered (api.github.com is
 * the allow-listed target and plain token records resolve), but the supplement
 * is skipped so the supervisor answers honestly that no refresh protocol is
 * configured.
 */
export function githubOAuth(
  clientId: string,
  scopes: readonly string[] = GITHUB_DEFAULT_SCOPES,
): OAuthPkceAuth {
  return {
    method: "oauth_pkce",
    authorizeUrl: GITHUB_AUTHORIZE_URL,
    tokenUrl: GITHUB_TOKEN_URL,
    clientId,
    scopes: [...scopes],
    redirect: "loopback",
  };
}

/**
 * Register the GitHub route and (when a client id is configured) its OAuth
 * refresh supplement. Idempotent: later calls overwrite the route and
 * supplement exactly like the LLM route registrations do.
 */
export function registerGithubCredentials(
  clientId: string = GITHUB_CLIENT_ID,
  scopes?: readonly string[],
): void {
  registerProviderRoutes([
    { id: "github", displayName: "GitHub", authKind: "oauth", baseURL: GITHUB_API_BASE },
  ]);
  if (clientId.length > 0) {
    registerOAuthSupplement({ github: githubOAuth(clientId, scopes) });
  }
}
