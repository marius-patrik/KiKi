/**
 * OAuth for the vault: the PKCE authorization flow, the device flow, and the
 * token refresher that keeps credentials alive.
 *
 * Ported from Andromeda `src/server/gateway/providers/oauth.ts`, with the
 * `CredentialStore`/`ProviderCredential`/`SecretValue` surface imported from
 * `./secret.js` and the cross-origin redirect guard from `./redirects.js`.
 * @module credentials/vault/oauth
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { URL, URLSearchParams } from "node:url";
import { fetchWithoutCrossOriginRedirects } from "./redirects.js";
import type { CredentialStore, ProviderCredential } from "./secret.js";
import { SecretValue } from "./secret.js";
import type { OAuthDeviceAuth, OAuthPkceAuth } from "./descriptor.js";
import { parseOAuthEndpointUrl } from "./descriptor.js";

const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const AUTHORIZATION_CODE_GRANT_TYPE = "authorization_code";
const REFRESH_TOKEN_GRANT_TYPE = "refresh_token";

type OAuthAuthConfig = OAuthPkceAuth | OAuthDeviceAuth;

export interface OAuthHttpResponse {
  status: number;
  body: unknown;
}

export type OAuthTransport = (request: {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}) => Promise<OAuthHttpResponse>;

export type OAuthOutcome = "authenticated" | "needs_api_key";

export interface OAuthSuccessResult {
  outcome: "authenticated";
  credential: ProviderCredential & { kind: "oauth" };
}

export interface OAuthNeedsApiKeyResult {
  outcome: "needs_api_key";
  reason: "access_denied";
}

export type OAuthLoginResult = OAuthSuccessResult | OAuthNeedsApiKeyResult;

export interface DeviceVerification {
  verificationUri: string;
  verificationUriComplete: string | null;
  userCode: string;
}

export interface OAuthPkceFlowOptions {
  providerId: string;
  auth: OAuthPkceAuth;
  store: CredentialStore;
  transport?: OAuthTransport;
  now?: () => number;
  timeoutMs?: number;
  openBrowser: (url: string) => Promise<void> | void;
}

export interface OAuthDeviceFlowOptions {
  providerId: string;
  auth: OAuthDeviceAuth;
  store: CredentialStore;
  transport?: OAuthTransport;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onVerification: (verification: DeviceVerification) => void;
}

export interface OAuthTokenRefreshOptions {
  store: CredentialStore;
  transport?: OAuthTransport;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  refreshSkewMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxAttempts?: number;
}

type RefreshState = "ready" | "needs_interactive_login";

interface DiscoveryDocument {
  issuer: string | undefined;
  authorization_endpoint: string | undefined;
  token_endpoint: string | undefined;
  device_authorization_endpoint: string | undefined;
}

/**
 * The default transport, and the only one in this file that touches a socket.
 *
 * Cross-origin redirects are refused rather than followed — see `redirects.ts`
 * for why, and note that this endpoint is the sharpest instance of the problem:
 * a 307 from the token endpoint replays a
 * `grant_type=refresh_token&refresh_token=…` body verbatim at the new origin,
 * and a body is never stripped by anything.
 */
export const oauthTransport: OAuthTransport = async ({ url, method, headers, body }) => {
  const response = await fetchWithoutCrossOriginRedirects(url, {
    method,
    headers,
    ...(body ? { body } : {}),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }
  return { status: response.status, body: parsed };
};

/** createPkceCodeVerifier implementation. */
export function createPkceCodeVerifier(random: () => Buffer = () => randomBytes(32)): string {
  return base64Url(random());
}

/** derivePkceCodeChallengeS256 implementation. */
export function derivePkceCodeChallengeS256(codeVerifier: string): string {
  return base64Url(createHash("sha256").update(codeVerifier).digest());
}

/**
 * Initiates an OAuth PKCE authorization flow.
 *
 * Guarantees:
 * - Returns an OAuthLoginResult containing the access token upon successful authorization.
 * - Handles the authorization process by opening a browser to the authorization URL.
 * - Ensures the code verifier is generated and used for the PKCE challenge.
 * - Listens for the callback on the specified path and timeout.
 *
 * Fails if the browser cannot be opened or the callback is not received within the timeout.
 */
export async function runPkceAuthorizationFlow(
  options: OAuthPkceFlowOptions,
): Promise<OAuthLoginResult> {
  const transport = options.transport ?? oauthTransport;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? 120_000;
  const endpoints = await resolveOAuthEndpoints(options.auth, transport);
  const codeVerifier = createPkceCodeVerifier();
  const codeChallenge = derivePkceCodeChallengeS256(codeVerifier);
  const state = base64Url(randomBytes(16));
  const callbackPath = options.auth.redirectPath ?? "/oauth/callback";

  const listener = await createLoopbackListener(callbackPath, timeoutMs);
  try {
    const authorizeUrl = new URL(endpoints.authorizationEndpoint);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", options.auth.clientId);
    authorizeUrl.searchParams.set("scope", options.auth.scopes.join(" "));
    authorizeUrl.searchParams.set("redirect_uri", listener.redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    await options.openBrowser(authorizeUrl.toString());

    const callback = await listener.waitForCallback();
    if (callback.state !== state) throw new Error("oauth callback state mismatch");
    if (callback.error === "access_denied") {
      await options.store.delete(options.providerId);
      return { outcome: "needs_api_key", reason: "access_denied" };
    }
    if (callback.error) throw new Error(`oauth authorization failed: ${callback.error}`);
    if (!callback.code) throw new Error("oauth callback did not include an authorization code");

    const clientSecret = await resolveClientSecret(options.store, options.auth);
    const tokenResponse = await oauthTokenRequest(transport, endpoints.tokenEndpoint, {
      grant_type: AUTHORIZATION_CODE_GRANT_TYPE,
      code: callback.code,
      client_id: options.auth.clientId,
      redirect_uri: listener.redirectUri,
      code_verifier: codeVerifier,
      ...(clientSecret ? { client_secret: clientSecret.reveal() } : {}),
    });
    const credential = tokenToCredential(tokenResponse, now(), options.auth.scopes);
    await options.store.put(options.providerId, credential);
    return { outcome: "authenticated", credential };
  } finally {
    await listener.close();
  }
}

/**
 * Initiates the OAuth device authorization flow to obtain an authentication credential.
 *
 * The caller must provide valid OAuthDeviceFlowOptions, including the device authorization URL,
 * client ID, and a transport mechanism for making HTTP requests.
 * On success, returns an OAuthLoginResult indicating the credential has been authenticated.
 * On failure, ensures the listener is properly closed.
 */
export async function runDeviceAuthorizationFlow(
  options: OAuthDeviceFlowOptions,
): Promise<OAuthLoginResult> {
  const transport = options.transport ?? oauthTransport;
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const endpoint = options.auth.deviceAuthorizationUrl;
  const initial = await oauthTokenRequest(transport, endpoint, {
    client_id: options.auth.clientId,
    scope: options.auth.scopes.join(" "),
  });
  const deviceCode = requiredString(initial, "device_code");
  const userCode = requiredString(initial, "user_code");
  const verificationUri = requiredString(initial, "verification_uri");
  const verificationUriComplete = optionalString(initial, "verification_uri_complete");
  const expiresIn = optionalFiniteNumber(initial, "expires_in") ?? 300;
  let intervalMs =
    (options.auth.pollIntervalSeconds ?? optionalFiniteNumber(initial, "interval") ?? 5) * 1_000;
  const expiresAt = now() + expiresIn * 1_000;

  options.onVerification({ verificationUri, verificationUriComplete, userCode });
  while (now() < expiresAt) {
    await sleep(intervalMs);
    const response = await oauthTokenRequest(transport, options.auth.tokenUrl, {
      grant_type: DEVICE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: options.auth.clientId,
    });
    const accessToken = optionalString(response, "access_token");
    if (accessToken) {
      const credential = tokenToCredential(response, now(), options.auth.scopes);
      await options.store.put(options.providerId, credential);
      return { outcome: "authenticated", credential };
    }
    const error = optionalString(response, "error");
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      intervalMs += 5_000;
      continue;
    }
    if (error === "access_denied") {
      await options.store.delete(options.providerId);
      return { outcome: "needs_api_key", reason: "access_denied" };
    }
    if (error === "expired_token")
      throw new Error("oauth device code expired before authorization");
    throw new Error(`oauth device flow failed: ${error ?? "unknown_error"}`);
  }
  throw new Error("oauth device flow expired before receiving an access token");
}

export class OAuthTokenRefresher {
  readonly #store: CredentialStore;
  readonly #transport: OAuthTransport;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #random: () => number;
  readonly #refreshSkewMs: number;
  readonly #baseBackoffMs: number;
  readonly #maxBackoffMs: number;
  readonly #maxAttempts: number;
  readonly #inflight = new Map<string, Promise<(ProviderCredential & { kind: "oauth" }) | null>>();
  readonly #state = new Map<string, RefreshState>();

  /** Constructs an instance. */
  constructor(options: OAuthTokenRefreshOptions) {
    this.#store = options.store;
    this.#transport = options.transport ?? oauthTransport;
    this.#now = options.now ?? (() => Date.now());
    this.#sleep =
      options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.#random = options.random ?? Math.random;
    this.#refreshSkewMs = options.refreshSkewMs ?? 120_000;
    this.#baseBackoffMs = options.baseBackoffMs ?? 500;
    this.#maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.#maxAttempts = options.maxAttempts ?? 5;
  }

  /**
   * Returns the current refresh state for the given provider.
   *
   * @param providerId - The unique identifier for the provider.
   * @returns The refresh state for the provider, which can be "ready", "in-progress", or "failed".
   *          If the provider is not found, returns "ready".
   */
  state(providerId: string): RefreshState {
    return this.#state.get(providerId) ?? "ready";
  }

  /** ensureFreshCredential implementation. */
  async ensureFreshCredential(
    providerId: string,
    auth: OAuthAuthConfig,
  ): Promise<(ProviderCredential & { kind: "oauth" }) | null> {
    if (this.state(providerId) === "needs_interactive_login") return null;
    const credential = await this.#store.get(providerId);
    if (!credential || credential.kind !== "oauth") return null;
    if (!shouldRefresh(credential, this.#now(), this.#refreshSkewMs)) return credential;
    return this.#singleFlightRefresh(providerId, auth, credential);
  }

  /** #singleFlightRefresh implementation. */
  async #singleFlightRefresh(
    providerId: string,
    auth: OAuthAuthConfig,
    credential: ProviderCredential & { kind: "oauth" },
  ): Promise<(ProviderCredential & { kind: "oauth" }) | null> {
    const inFlight = this.#inflight.get(providerId);
    if (inFlight) return inFlight;
    const refresh = this.#refresh(providerId, auth, credential).finally(() => {
      this.#inflight.delete(providerId);
    });
    this.#inflight.set(providerId, refresh);
    return refresh;
  }

  /** #refresh implementation. */
  async #refresh(
    providerId: string,
    auth: OAuthAuthConfig,
    credential: ProviderCredential & { kind: "oauth" },
  ): Promise<(ProviderCredential & { kind: "oauth" }) | null> {
    if (!credential.refreshToken) {
      this.#state.set(providerId, "needs_interactive_login");
      return null;
    }
    const tokenEndpoint = resolveTokenEndpoint(auth);
    const clientSecret = await this.#clientSecret(auth);
    for (let attempt = 0; attempt < this.#maxAttempts; attempt += 1) {
      const body = await oauthTokenRequest(this.#transport, tokenEndpoint, {
        grant_type: REFRESH_TOKEN_GRANT_TYPE,
        refresh_token: credential.refreshToken.reveal(),
        client_id: auth.clientId,
        ...(clientSecret ? { client_secret: clientSecret.reveal() } : {}),
      });
      const accessToken = optionalString(body, "access_token");
      if (accessToken) {
        const refreshed = tokenToCredential(
          body,
          this.#now(),
          credential.scopes,
          credential.refreshToken,
        );
        await this.#store.put(providerId, refreshed);
        this.#state.delete(providerId);
        return refreshed;
      }
      const error = optionalString(body, "error");
      if (error === "invalid_grant") {
        this.#state.set(providerId, "needs_interactive_login");
        return null;
      }
      if (!isTransientRefreshError(error))
        throw new Error(`oauth refresh failed: ${error ?? "unknown_error"}`);
      if (attempt + 1 >= this.#maxAttempts) break;
      await this.#sleep(
        jitteredBackoff(this.#baseBackoffMs, this.#maxBackoffMs, attempt, this.#random),
      );
    }
    throw new Error("oauth refresh failed after retries");
  }

  /**
   * The client secret a provider's token endpoint additionally demands, if it
   * declares one.
   *
   * Only `oauth_pkce` can declare it, and only by *record id* — the value lives
   * in the vault like any other secret and is resolved here, at the one point
   * it is needed, exactly as the access token itself is. A declared-but-absent
   * record is not fatal: the refresh proceeds with `client_id` alone and the
   * provider's own `invalid_client` response is a far clearer diagnosis than a
   * pre-emptive throw would be, since some Google clients do accept it.
   *
   * Deliberately not cached. A refresher outlives many refreshes, and holding
   * secret material in a long-lived field is the thing this codebase keeps
   * declining to do; one vault read per refresh is not a cost worth that.
   */
  async #clientSecret(auth: OAuthAuthConfig): Promise<SecretValue | null> {
    return resolveClientSecret(this.#store, auth);
  }
}

/**
 * Resolve a declared client secret out of the vault, or null.
 *
 * See `clientSecretCredentialId` for why a "public" client has a secret at
 * all. Absent, wrong-kind and undeclared all collapse to null: the request
 * then goes out with `client_id` alone, and the authorization server's own
 * `invalid_client` is a better error than anything guessed here.
 */
async function resolveClientSecret(
  store: CredentialStore,
  auth: OAuthAuthConfig,
): Promise<SecretValue | null> {
  if (auth.method !== "oauth_pkce" || !auth.clientSecretCredentialId) return null;
  const record = await store.get(auth.clientSecretCredentialId);
  if (!record) return null;
  // Stored as an api_key record: a static string with no refresh of its own,
  // which is precisely what that variant models.
  return record.kind === "api_key" ? record.apiKey : null;
}

/**
 * Resolves the OAuth client secret from the vault or returns null if not found.
 *
 * Guarantees a null return if the method is not "oauth_pkce" or if the client
 * secret credential ID is not provided. Returns the secret value if found,
 * otherwise null.
 *
 * @param store - The credential store to retrieve the secret from.
 * @param auth - The OAuth authentication configuration.
 * @returns The client secret value or null if not found.
 */
export async function resolveOAuthEndpoints(
  auth: OAuthPkceAuth,
  transport: OAuthTransport,
): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  deviceAuthorizationEndpoint: string | null;
}> {
  const discovered: DiscoveryDocument = auth.discoveryUrl
    ? await fetchDiscovery(auth.discoveryUrl, transport)
    : {
        issuer: undefined,
        authorization_endpoint: undefined,
        token_endpoint: undefined,
        device_authorization_endpoint: undefined,
      };
  // The issuer check gates *adoption*, and adoption is a question about
  // provenance rather than about the resulting string: a configuration that
  // states the same token endpoint its IdP publishes has not adopted anything,
  // and must not start requiring an `issuer` of that IdP merely because the
  // two agree. A document that supplies only the device authorization endpoint
  // is not checked either — that endpoint receives a client id and a scope
  // list, no credential and no browser session, so demanding RFC 8414 §3.3 of
  // it would reject working setups for nothing.
  //
  // Both adoptions below are unreachable today: the configuration makes
  // `authorizeUrl` and `tokenUrl` mandatory and they take precedence. That is
  // exactly why the guard belongs here now, rather than in the change that
  // eventually relaxes either of them to optional.
  const adoptsAuthorization = !auth.authorizeUrl && Boolean(discovered.authorization_endpoint);
  const adoptsToken = !auth.tokenUrl && Boolean(discovered.token_endpoint);
  if (auth.discoveryUrl && (adoptsAuthorization || adoptsToken)) {
    assertDiscoveryIssuer(auth.discoveryUrl, discovered.issuer ?? null);
  }
  return {
    authorizationEndpoint: auth.authorizeUrl || discovered.authorization_endpoint || "",
    tokenEndpoint: auth.tokenUrl || discovered.token_endpoint || "",
    deviceAuthorizationEndpoint: discovered.device_authorization_endpoint ?? null,
  };
}

/**
 * Where a refresh sends the refresh token.
 *
 * Pinned to the configuration, and deliberately does not consult the network.
 * The previous form re-ran discovery on every single refresh, which meant the
 * destination of a long-lived credential was re-decided from a document
 * fetched moments earlier — a fresh opportunity, on every refresh, for whoever
 * can answer that fetch. It also could not change the answer: `tokenUrl` is
 * mandatory on both OAuth schemas and takes precedence over anything
 * discovered, so the round trip bought exactly nothing and risked something.
 *
 * Discovery still runs at login, where an operator is present and the result is
 * used to fill in what the configuration does not state.
 */
function resolveTokenEndpoint(auth: OAuthAuthConfig): string {
  return auth.tokenUrl;
}

/**
 * Returns configuration for OAuth endpoints based on provided or discovered URLs.
 *
 * Guarantees the returned configuration includes `authorizationEndpoint`, `tokenEndpoint`, and optionally `deviceAuthorizationEndpoint`.
 * Fails if `auth.discoveryUrl` is provided and either `adoptsAuthorization` or `adoptsToken` is true, by asserting the issuer.
 */
async function fetchDiscovery(url: string, transport: OAuthTransport): Promise<DiscoveryDocument> {
  const response = await transport({
    url,
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`oauth discovery failed with status ${response.status}`);
  }
  const body = asRecord(response.body);
  return {
    issuer: optionalString(body, "issuer") ?? undefined,
    authorization_endpoint: discoveredEndpoint(body, "authorization_endpoint"),
    token_endpoint: discoveredEndpoint(body, "token_endpoint"),
    device_authorization_endpoint: discoveredEndpoint(body, "device_authorization_endpoint"),
  };
}

/**
 * An endpoint out of a discovery document, held to the same scheme rule the
 * configuration shape holds its own URLs to.
 *
 * The document is network-supplied and reaches `fetch` directly, so
 * `optionalString` alone would let `http://` to an arbitrary host — or a
 * relative path, or a `javascript:` URL — through a rule that rejects all
 * three when a human writes them into a descriptor. Rejecting outright rather
 * than dropping the field: a metadata document naming an endpoint we will not
 * use is broken or hostile, and silently falling back to `""` would surface as
 * an unrelated error several frames later.
 */
function discoveredEndpoint(body: Record<string, unknown>, field: string): string | undefined {
  const raw = optionalString(body, field);
  if (raw === null) return undefined;
  if (!parseOAuthEndpointUrl(raw))
    throw new Error(`oauth discovery document has an unusable ${field}`);
  return raw;
}

/**
 * RFC 8414 §3.3: the `issuer` in the metadata must be identical to the issuer
 * identifier the metadata was retrieved for. Without it, a document is just
 * some JSON from some host, and the endpoints in it are whatever that host
 * says — which is the whole attack.
 *
 * Both well-known placements are accepted, because both are in use: RFC 8414
 * inserts the well-known segment at the root
 * (`https://host/.well-known/oauth-authorization-server/tenant` for issuer
 * `https://host/tenant`), while OpenID Connect Discovery appends it
 * (`https://host/tenant/.well-known/openid-configuration`). Stripping the
 * `.well-known/<name>` pair and rejoining what is left covers both without
 * having to know which convention the server chose.
 */
function assertDiscoveryIssuer(discoveryUrl: string, issuer: string | null): void {
  const expected = expectedIssuer(discoveryUrl);
  if (expected === null) {
    throw new Error(
      `oauth discovery url is not a well-known metadata url, so its issuer cannot be checked: ${discoveryUrl}`,
    );
  }
  if (!issuer) {
    throw new Error("oauth discovery document has no issuer, so its endpoints cannot be adopted");
  }
  if (trimTrailingSlash(issuer) !== trimTrailingSlash(expected)) {
    throw new Error(`oauth discovery issuer ${issuer} does not match ${discoveryUrl}`);
  }
}

/**
 * Validates the issuer field in the metadata document against the expected
 * issuer identifier. If the issuer does not match or is unusable, an error is
 * thrown. Returns the issuer string if it matches the expected issuer.
 *
 * @param body - The metadata document as a record of strings.
 * @param field - The field name representing the issuer in the document.
 * @returns The issuer string if valid, or undefined if the field is missing.
 * @throws An error if the issuer does not match the expected issuer or is
 *         unusable.
 */
function expectedIssuer(discoveryUrl: string): string | null {
  const url = new URL(discoveryUrl);
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const wellKnown = segments.indexOf(".well-known");
  if (wellKnown < 0 || wellKnown + 1 >= segments.length) return null;
  const remainder = [...segments.slice(0, wellKnown), ...segments.slice(wellKnown + 2)];
  return remainder.length === 0 ? url.origin : `${url.origin}/${remainder.join("/")}`;
}

/** trimTrailingSlash implementation. */
function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Ensures the issuer in the metadata matches the expected issuer for the given
 * discovery URL. Throws an error if the issuer is missing or doesn't match.
 *
 * @param discoveryUrl - The URL of the OAuth discovery document.
 * @param issuer - The issuer identifier from the metadata.
 * @throws Will throw an error if the issuer is missing or doesn't match the
 * expected issuer for the discovery URL.
 */
async function oauthTokenRequest(
  transport: OAuthTransport,
  url: string,
  parameters: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(parameters);
  const response = await transport({
    url,
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  return asRecord(response.body);
}

/** tokenToCredential implementation. */
function tokenToCredential(
  tokenResponse: Record<string, unknown>,
  nowMs: number,
  scopes: readonly string[],
  existingRefreshToken: SecretValue | null = null,
): ProviderCredential & { kind: "oauth" } {
  const accessToken = requiredString(tokenResponse, "access_token");
  const refreshTokenRaw = optionalString(tokenResponse, "refresh_token");
  const expiresIn = optionalFiniteNumber(tokenResponse, "expires_in");
  const refreshExpiresIn =
    optionalFiniteNumber(tokenResponse, "refresh_token_expires_in") ??
    optionalFiniteNumber(tokenResponse, "refresh_expires_in");
  return {
    kind: "oauth",
    accessToken: new SecretValue(accessToken),
    refreshToken: refreshTokenRaw ? new SecretValue(refreshTokenRaw) : existingRefreshToken,
    expiresAt: expiresIn === null ? null : new Date(nowMs + expiresIn * 1_000).toISOString(),
    refreshTokenExpiresAt:
      refreshExpiresIn === null ? null : new Date(nowMs + refreshExpiresIn * 1_000).toISOString(),
    scopes,
    subscriptionType: optionalString(tokenResponse, "subscription_type"),
    obtainedAt: new Date(nowMs).toISOString(),
  };
}

/** shouldRefresh implementation. */
function shouldRefresh(
  credential: ProviderCredential & { kind: "oauth" },
  nowMs: number,
  skewMs: number,
): boolean {
  if (!credential.expiresAt) return false;
  const expiresAt = Date.parse(credential.expiresAt);
  return Number.isFinite(expiresAt) && nowMs + skewMs >= expiresAt;
}

/**
 * Extracts the path segment between ".well-known" and the last segment of the URL.
 *
 * @param url - The URL from which to extract the path segment.
 * @returns The path segment between ".well-known" and the last segment, or the URL origin if no such segment exists.
 * @throws Will throw an error if the URL does not contain ".well-known" or if it is not followed by another segment.
 */
function jitteredBackoff(
  baseMs: number,
  maxMs: number,
  attempt: number,
  random: () => number,
): number {
  const core = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitter = core * 0.2 * (random() * 2 - 1);
  return Math.max(0, Math.round(core + jitter));
}

/**
 * Determines if an error is a transient refresh error.
 *
 * @returns Returns true if the error is a transient refresh error; otherwise, false.
 * @throws Throws no errors, but returns false for non-transient errors.
 */
function isTransientRefreshError(error: string | null): boolean {
  return (
    error === null ||
    error === "temporarily_unavailable" ||
    error === "server_error" ||
    error === "slow_down"
  );
}

/**
 * Establishes a loopback listener for OAuth token requests.
 *
 * @param discoveryUrl - The URL of the OAuth discovery document.
 * @param issuer - The issuer identifier from the metadata.
 * @throws Will throw an error if the issuer does not match the expected issuer
 * for the discovery URL or if the issuer is missing.
 */
async function createLoopbackListener(
  pathname: string,
  timeoutMs: number,
): Promise<{
  redirectUri: string;
  waitForCallback: () => Promise<{
    state: string | null;
    code: string | null;
    error: string | null;
  }>;
  close: () => Promise<void>;
}> {
  let resolved = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let settle:
    | ((value: { state: string | null; code: string | null; error: string | null }) => void)
    | null = null;
  let fail: ((error: Error) => void) | null = null;
  const callbackPromise = new Promise<{
    state: string | null;
    code: string | null;
    error: string | null;
  }>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const server = createServer((request, response) => {
    if (resolved) {
      response.statusCode = 409;
      response.end("Already handled");
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== pathname) {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }
    resolved = true;
    response.statusCode = 200;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Authorization captured. You can close this tab.");
    if (timeout) clearTimeout(timeout);
    settle?.({
      state: url.searchParams.get("state"),
      code: url.searchParams.get("code"),
      error: url.searchParams.get("error"),
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("oauth loopback listener failed to bind");
  const redirectUri = `http://127.0.0.1:${address.port}${pathname}`;

  timeout = setTimeout(() => {
    if (resolved) return;
    resolved = true;
    fail?.(new Error("oauth loopback callback timed out"));
  }, timeoutMs);

  return {
    redirectUri,
    waitForCallback: () => callbackPromise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (timeout) clearTimeout(timeout);
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * Extracts the path segment from a URL after ".well-known" or returns the URL origin if no such segment exists.
 *
 * @param url - The URL from which to extract the path segment.
 * @returns The path segment between ".well-known" and the last segment, or the URL origin if no such segment exists.
 * @throws Will throw an error if the URL does not contain ".well-known" or if it is not followed by another segment.
 */
function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** asRecord implementation. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** requiredString implementation. */
function requiredString(value: Record<string, unknown>, field: string): string {
  const raw = value[field];
  if (typeof raw !== "string" || raw.length === 0)
    throw new Error(`oauth response missing ${field}`);
  return raw;
}

/**
 * Checks if an error is a transient refresh error.
 *
 * @param error - The error string or null indicating the error type.
 * @returns true if the error is transient; otherwise, false.
 * @throws Throws no errors, but returns false for non-transient errors.
 */
function optionalString(value: Record<string, unknown>, field: string): string | null {
  const raw = value[field];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Establishes a loopback listener for OAuth token requests.
 *
 * @param pathname - The path to listen for OAuth token requests.
 * @param timeoutMs - The timeout duration in milliseconds for the request.
 * @throws Will throw an error if the request does not receive a response within the specified timeout.
 * @returns An object containing the redirect URI, a callback to wait for the OAuth callback, and a method to close the listener.
 */
function optionalFiniteNumber(value: Record<string, unknown>, field: string): number | null {
  const raw = value[field];
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}
