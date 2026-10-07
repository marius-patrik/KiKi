import { findProviderDescriptor } from "../provider-descriptor.js";
import type { SecretRecord } from "../record.js";
import { providerIdForPurpose } from "./host-allowlist.js";

/** Tag namespace for auth-placement tags. */
const AUTH_TAG = "auth:";

/** Where the credential goes on the wire. */
export type AuthPlacement =
  | { kind: "header"; header: string; prefix: string }
  | { kind: "query"; parameter: string }
  | { kind: "basic" }
  | { kind: "cookie" };

/**
 * How this credential is presented, from the descriptor unless the record says
 * otherwise. `auth:` tags are the override, for the many credentials whose
 * purpose is not a model provider at all: `auth:bearer`, `auth:header:X-Token`,
 * `auth:prefix:Token `, `auth:query:key`, `auth:basic`.
 *
 * Null means "the vault does not know where this goes", and the request is
 * refused. Guessing is the wrong direction: a key put in the wrong header is a
 * credential sent somewhere it was never meant to appear.
 */
export function authPlacementFor(record: SecretRecord): AuthPlacement | null {
  const tags = record.tags
    .filter((tag) => tag.startsWith(AUTH_TAG))
    .map((tag) => tag.slice(AUTH_TAG.length));
  const prefixTag = tags.find((tag) => tag.startsWith("prefix:"));
  const prefix = prefixTag ? prefixTag.slice("prefix:".length) : null;
  for (const tag of tags) {
    if (tag === "bearer")
      return { kind: "header", header: "Authorization", prefix: prefix ?? "Bearer " };
    if (tag === "basic") return { kind: "basic" };
    if (tag === "cookie") return { kind: "cookie" };
    if (tag.startsWith("header:")) {
      const header = tag.slice("header:".length).trim();
      if (header) return { kind: "header", header, prefix: prefix ?? "" };
    }
    if (tag.startsWith("query:")) {
      const parameter = tag.slice("query:".length).trim();
      if (parameter) return { kind: "query", parameter };
    }
  }

  const descriptor = findProviderDescriptor(providerIdForPurpose(record.purpose));
  const descriptorAuth =
    descriptor && descriptor.auth?.method === "api_key" ? descriptor.auth : null;

  if (record.material.type === "api_key") {
    const header = record.material.header ?? descriptorAuth?.header ?? null;
    if (!header) return null;
    const descriptorPrefix =
      descriptorAuth && descriptorAuth.header.toLowerCase() === header.toLowerCase()
        ? descriptorAuth.prefix
        : null;
    return {
      kind: "header",
      header,
      prefix:
        prefix ?? descriptorPrefix ?? (header.toLowerCase() === "authorization" ? "Bearer " : ""),
    };
  }
  // RFC 6750: an OAuth access token is a bearer token. That is not a guess.
  if (record.material.type === "oauth_token")
    return { kind: "header", header: "Authorization", prefix: "Bearer " };
  if (record.material.type === "cookie_jar") return { kind: "cookie" };
  if (record.material.type === "password") return { kind: "basic" };
  return null;
}
