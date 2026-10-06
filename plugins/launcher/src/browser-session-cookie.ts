/**
 * Mints a `Cookie` header matching harness's own browser-session auth
 * (`@deepseek-ai/dsh-client-connection`'s `browser-auth.ts`): reads the
 * durable HMAC signing secret harness stores in `<home>/.credentials.yaml`
 * under the `client-connection/browser-session` credential key, and signs a
 * cookie locally for the loopback authority this package's own RPC calls
 * use.
 *
 * This mirrors a small, versioned wire protocol (cookie payload version 1,
 * HMAC-SHA256 over a JSON body) instead of booting a full cordis app just to
 * read one credential through `@deepseek-ai/dsh-credentials`' service --
 * `dsh status`/`dsh attach` and the server they poll already share the same
 * trust boundary (local filesystem access to `DSH_HOME`), and harness's
 * `BrowserAuth` class exposes no standalone signer for a caller that already
 * holds the secret out-of-band.
 * @module launcher/browser-session-cookie
 */
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/** Credential key harness's browser-auth.ts stores the signing secret under. */
const CREDENTIAL_KEY = "client-connection/browser-session";
/** `BrowserCookiePayload`'s wire version, from dsh-client-connection/browser-auth.ts. */
const COOKIE_PAYLOAD_VERSION = 1;
/** `StoredSecretPayload`'s wire version, from the same module. */
const STORED_SECRET_VERSION = 1;
/** `COOKIE_PREFIX`, from the same module. */
const COOKIE_PREFIX = "dsh-auth-";
/** `SECRET_BYTES`, from the same module. */
const SECRET_BYTES = 32;
/**
 * Cookie lifetime this launcher mints: long enough to outlive one RPC round
 * trip's clock skew, short enough that a leaked value (e.g. into a log) is
 * useless within the minute. Independent of harness's own `maxAgeDays`
 * browser-cookie lifetime -- this cookie is minted fresh per request, never
 * stored or reused.
 */
const COOKIE_LIFETIME_MS = 60_000;

/** Base64url-encode, matching browser-auth.ts's `encodeBase64Url`. */
function encodeBase64Url(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/**
 * Reads the durable browser-session signing secret from
 * `<home>/.credentials.yaml`. Returns undefined when the file, the record,
 * or its shape is missing or unrecognized -- callers degrade to an
 * unauthenticated request rather than throwing, matching every other
 * best-effort probe in this package.
 */
export async function readBrowserSessionSecret(home: string): Promise<Buffer | undefined> {
  let text: string;
  try {
    text = await readFile(join(home, ".credentials.yaml"), "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const records = (parsed as { records?: unknown }).records;
  if (typeof records !== "object" || records === null) return undefined;
  const record = (records as Record<string, unknown>)[CREDENTIAL_KEY];
  if (typeof record !== "object" || record === null) return undefined;
  const { kind, payload } = record as { kind?: unknown; payload?: unknown };
  if (kind !== "grant" || typeof payload !== "object" || payload === null) return undefined;
  const { version, secret } = payload as { version?: unknown; secret?: unknown };
  if (version !== STORED_SECRET_VERSION || typeof secret !== "string") return undefined;
  const decoded = Buffer.from(secret.replaceAll("-", "+").replaceAll("_", "/"), "base64");
  return decoded.byteLength === SECRET_BYTES ? decoded : undefined;
}

/**
 * Builds the `Cookie` header value harness's browser-session auth accepts
 * for `authority` (the exact `Host` header value the request will carry,
 * e.g. `127.0.0.1:3080`), signed with `secret`. Mirrors browser-auth.ts's
 * private cookie encoding: name `dsh-auth-<base64url(sha256(authority))>`,
 * value `v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(secret, body))>`.
 */
export function browserSessionCookieHeader(secret: Buffer, authority: string): string {
  const issuedAt = Date.now();
  const payload = {
    version: COOKIE_PAYLOAD_VERSION,
    authority,
    issuedAt,
    expiresAt: issuedAt + COOKIE_LIFETIME_MS,
  };
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = encodeBase64Url(createHmac("sha256", secret).update(body).digest());
  const name = COOKIE_PREFIX + encodeBase64Url(createHash("sha256").update(authority).digest());
  return `${name}=v1.${body}.${signature}`;
}
