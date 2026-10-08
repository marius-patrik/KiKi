import { findProviderDescriptor } from "../provider-descriptor.js";
import type { SecretRecord } from "../record.js";

/** Tag namespace for host-allowlist tags. Tags are the record's free-form channel; see `cli.ts`. */
const HOST_TAG = "host:";

/** The provider descriptor id a purpose names, if any. `aws/production` -> `aws`. */
export function providerIdForPurpose(purpose: string): string {
  return purpose.split("/")[0] ?? purpose;
}

/**
 * Hosts this credential may be presented to.
 *
 * Three sources, in this order and no others:
 *
 * 1. the provider descriptor the purpose names — its base URL, its catalog
 *    endpoint, and every OAuth endpoint it declares, because those are exactly
 *    the hosts the descriptor says this credential is *for*;
 * 2. the material's own origins — a password's login URL, a cookie jar's
 *    origin, a token's endpoint;
 * 3. `host:` tags on the record, which is how the owner writes down a host for
 *    a purpose that is not a model provider at all.
 *
 * An empty result denies every request. A bare `*` is discarded rather than
 * honoured: a credential permitted everywhere is the exfiltration path this
 * whole module exists to close, so there is deliberately no way to spell it.
 */
export function allowedHostsFor(record: SecretRecord): string[] {
  const hosts = new Set<string>();
  /**
   * Adds the base URL and, if applicable, additional OAuth URLs to the set of allowed hosts.
   *
   * Guarantees: Adds the base URL of the provider descriptor to the set of allowed hosts.
   *            If the model catalog is of type "list_endpoint", adds its URL.
   *            Depending on the authentication method, adds OAuth-related URLs to the set.
   *
   * On failure: No URLs are added to the set if any of the URLs are invalid or undefined.
   */
  const addUrl = (value: string | null | undefined): void => {
    if (!value) return;
    const host = hostOf(value);
    if (host) hosts.add(host);
  };

  const descriptor = findProviderDescriptor(providerIdForPurpose(record.purpose));
  if (descriptor) {
    addUrl(descriptor.baseUrl);
    if (descriptor.modelCatalog.kind === "list_endpoint") addUrl(descriptor.modelCatalog.url);
    const auth = descriptor.auth;
    if (auth?.method === "oauth_pkce") {
      addUrl(auth.authorizeUrl);
      addUrl(auth.tokenUrl);
      addUrl(auth.revokeUrl);
      addUrl(auth.discoveryUrl);
    } else if (auth?.method === "oauth_device") {
      addUrl(auth.deviceAuthorizationUrl);
      addUrl(auth.tokenUrl);
    }
  }

  switch (record.material.type) {
    case "password":
      addUrl(record.material.origin);
      addUrl(record.material.loginUrl);
      break;
    case "cookie_jar":
      addUrl(record.material.origin);
      break;
    case "oauth_token":
      addUrl(record.material.tokenEndpoint);
      break;
    case "passkey":
      hosts.add(record.material.relyingPartyId.toLowerCase());
      break;
    default:
      break;
  }

  for (const tag of record.tags) {
    if (!tag.startsWith(HOST_TAG)) continue;
    const pattern = tag.slice(HOST_TAG.length).trim().toLowerCase();
    // `*` alone, an empty pattern, and a pattern that is only a suffix marker
    // are all "everywhere". None of them are a host.
    if (!pattern || pattern === "*" || pattern === "*." || pattern.includes("/")) continue;
    hosts.add(pattern);
  }

  return [...hosts].sort();
}

/**
 * Whether `hostname` matches the allow-list. Exact match, or a `*.example.com`
 * pattern which covers subdomains and deliberately does *not* cover the bare
 * domain — a wildcard that silently widened to its own parent would be a
 * surprise in the one direction that matters.
 */
export function hostAllowed(patterns: readonly string[], hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  return patterns.some((raw) => {
    const pattern = normalizeHost(raw);
    if (!pattern) return false;
    if (pattern === host) return true;
    if (!pattern.startsWith("*.")) return false;
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  });
}

/**
 * Ensures the hostname is in a consistent format by trimming, lowercasing, and removing trailing dots.
 * Returns the normalized hostname or an empty string if the input is invalid.
 *
 * @param hostname - The hostname to normalize.
 * @returns The normalized hostname or an empty string if invalid.
 */
function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Determines if the given hostname matches any pattern in the provided list of patterns.
 * Returns the matching pattern or null if no match is found.
 *
 * @param value - The hostname to check against the patterns.
 * @returns The matching pattern or null if no match is found.
 */
function hostOf(value: string): string | null {
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    // A bare host in a tag or an origin field is still a host.
    const bare = normalizeHost(value);
    return /^[a-z0-9.*-]+$/.test(bare) && bare.includes(".") ? bare : null;
  }
}
