/**
 * Canonical reference mapping for the account seam.
 *
 * The provider routes in `providers` resolve credentials through
 * `ctx.accounts.resolve(ref)` with canonical slot references such as
 * `CLAUDE_SUB_OAUTH_TOKEN`. Those references are not valid vault record ids —
 * ids are lowercase kebab-case — so the seam addresses a record through a
 * `ref:<REF>` tag and this module owns the one direction a reference becomes a
 * record: the slug id, the material shape, and the purpose it carries.
 *
 * The same mapping lets scanned findings land under the refs the providers
 * resolve, so an imported login and a manually stored secret are found by the
 * same name.
 * @module credentials/refs
 */

import { SecretValue } from "./vault/secret.js";
import {
  createSecretRecord,
  type SecretDescriptor,
  type SecretMaterial,
  type SecretRecord,
  type SecretType,
} from "./vault/record.js";

const REF_TAG_PREFIX = "ref:";

/** The tag a seam-stored record carries for its canonical reference. */
export function refTag(ref: string): string {
  return `${REF_TAG_PREFIX}${ref}`;
}

/**
 * The deterministic record id for a canonical reference: lowercase, runs of
 * non-alphanumerics collapsed to a dash, and always starting with a letter so
 * it satisfies the record-id grammar. `CLAUDE_SUB_OAUTH_TOKEN` ->
 * `claude-sub-oauth-token`.
 *
 * When an account name is provided, it is appended after a double-dash:
 * `CLAUDE_SUB_OAUTH_TOKEN` + `"work"` -> `claude-sub-oauth-token--work`.
 * This lets two accounts for the same ref coexist in the vault without collision.
 */
export function slugRecordId(ref: string, account?: string): string {
  const slug = ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const base = /^[a-z]/.test(slug) ? slug : `ref-${slug}`;
  if (account === undefined || account.length === 0) return base;
  const accountSlug = account
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return `${base}--${accountSlug}`;
}

/**
 * The canonical reference a descriptor is addressed by: its `ref:` tag when it
 * has one, else the record id upper-cased with dashes as underscores (the
 * inverse of {@link slugRecordId}, for records that were never tagged).
 */
export function canonicalRefOf(descriptor: SecretDescriptor): string {
  const tagged = descriptor.tags.find((tag) => tag.startsWith(REF_TAG_PREFIX));
  if (tagged) return tagged.slice(REF_TAG_PREFIX.length);
  return descriptor.id.replace(/-+/g, "_").toUpperCase();
}

/** The material shape a canonical reference stores, by its name. */
export type RefMaterialKind = "api_key" | "oauth_token" | "cookie_jar";

/**
 * Classify a canonical reference: `*_API_KEY` refs hold API keys, the Gemini
 * subscription cookie refs hold single cookie values, everything else is an
 * OAuth access token.
 */
export function refMaterialKind(ref: string): RefMaterialKind {
  if (ref.endsWith("_API_KEY")) return "api_key";
  if (ref.startsWith("GEMINI_SUB_COOKIE_")) return "cookie_jar";
  return "oauth_token";
}

const REF_PURPOSES: Readonly<Record<string, string>> = {
  CLAUDE_SUB_OAUTH_TOKEN: "anthropic/claude-code",
  CLAUDE_API_KEY: "anthropic/claude-code",
  CURSOR_SUB_TOKEN: "cursor",
  CURSOR_EMAIL: "cursor",
  CURSOR_SIGNUP_TYPE: "cursor",
  GROK_SUB_OAUTH_TOKEN: "xai/grok-cli",
  KIMI_SUB_OAUTH_TOKEN: "moonshot/kimi",
  KIMI_API_KEY: "moonshot/kimi",
  ZEN_API_KEY: "opencode/zen",
  ANTIGRAVITY_PROJECT: "google/antigravity",
  GITHUB_OAUTH_TOKEN: "github",
  GITHUB_USER: "github",
  GITHUB_ENTERPRISE_TOKEN: "github",
  GITHUB_ENTERPRISE_HOST: "github",
};

/** The purpose a canonical reference belongs to, for the supervisor and tools. */
export function purposeForRef(ref: string): string {
  return (
    REF_PURPOSES[ref] ??
    (ref.startsWith("GEMINI_SUB_COOKIE_") ? "google/gemini-cli" : slugRecordId(ref))
  );
}

/** Material for a raw value stored under a canonical reference. */
export function materialFromValue(ref: string, value: string): SecretMaterial {
  switch (refMaterialKind(ref)) {
    case "api_key":
      return { type: "api_key", apiKey: new SecretValue(value), header: null };
    case "cookie_jar":
      return {
        type: "cookie_jar",
        origin: slugRecordId(ref),
        jar: new SecretValue(value),
        sessionExpiresAt: null,
      };
    case "oauth_token":
      return {
        type: "oauth_token",
        accessToken: new SecretValue(value),
        refreshToken: null,
        refreshTokenExpiresAt: null,
        scopes: [],
        subscriptionType: null,
        tokenEndpoint: null,
      };
  }
}

/**
 * The record a canonical reference resolves to. Scope denies every agent, so a
 * value stored through the owner seam is never agent-readable until someone
 * scopes it deliberately.
 *
 * When an account name is provided, the record is tagged with `account:<name>`
 * and its id includes the account dimension, so two accounts for the same ref
 * coexist without collision.
 */
export function recordForRef(
  ref: string,
  value: string,
  options: { now?: () => number; account?: string } = {},
): SecretRecord {
  const tags = [refTag(ref)];
  if (options.account !== undefined && options.account.length > 0) {
    tags.push(`account:${options.account}`);
  }
  return createSecretRecord({
    id: slugRecordId(ref, options.account),
    label: ref,
    purpose: purposeForRef(ref),
    scope: { workspace: "*", agents: [] },
    tags,
    material: materialFromValue(ref, value),
    ...(options.now ? { now: options.now } : {}),
  });
}

/**
 * The string a record exposes through the seam, or null when its type is not a
 * single resolvable secret (a password, a TOTP seed, an SSH key…).
 */
export function revealFromRecord(record: SecretRecord): string | null {
  switch (record.material.type) {
    case "api_key":
      return record.material.apiKey.reveal();
    case "oauth_token":
      return record.material.accessToken.reveal();
    case "cookie_jar":
      return record.material.jar.reveal();
    case "generic_note":
      return record.material.note.reveal();
    default:
      return null;
  }
}

/**
 * The canonical provider references a scanned finding should be found under,
 * when the found material matches the wire auth the route uses. Deliberately
 * conservative: Gemini's subscription route needs cookies, so its CLI OAuth
 * token is not labelled as something it is not, and Kimi has no scanner.
 */
export function canonicalRefsForPurpose(purpose: string, type: SecretType): readonly string[] {
  if (purpose === "github") return ["GITHUB_OAUTH_TOKEN"];
  if (type !== "oauth_token") return [];
  if (purpose === "anthropic/claude-code" || purpose.startsWith("anthropic/claude-code-"))
    return ["CLAUDE_SUB_OAUTH_TOKEN"];
  if (purpose === "cursor") return ["CURSOR_SUB_TOKEN"];
  if (purpose === "xai/grok-cli") return ["GROK_SUB_OAUTH_TOKEN"];
  return [];
}
