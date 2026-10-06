/**
 * RFC 6238 time-based one-time passwords, and the `otpauth://` URI that carries
 * their parameters.
 *
 * This is the piece that turns "MFA is enabled" from a reason the owner must be
 * present into a lookup. A TOTP seed is a shared secret; once it is in the
 * vault, the second factor is computable, and an automated login can satisfy it
 * without a phone.
 *
 * Being honest about what that costs: a TOTP seed in the vault means the second
 * factor lives beside the first, so the two factors are no longer independent
 * against an attacker who has the vault. That is a real reduction in the
 * security property MFA was bought for. It is the trade the owner asked for, and
 * it is why the vault's master key wants to move to an OS keychain or OpenBao —
 * `masterkey.ts` is that seam. Recording it here so the trade stays visible.
 *
 * Implementation notes worth keeping: the dynamic truncation in
 * `hotpCode` is RFC 4226 §5.3 verbatim, the counter is a BigInt because
 * RFC 6238's own test vectors run past 2^32 seconds, and code comparison is
 * constant-time so verification does not leak a prefix.
 * @module credentials/vault/totp
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { SecretValue } from "./secret.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const OTPAUTH_SCHEME = "otpauth:";

/** Hash functions RFC 6238 §1.2 admits for the HMAC. */
export const TOTP_ALGORITHMS = ["SHA1", "SHA256", "SHA512"] as const;
export type TotpAlgorithm = (typeof TOTP_ALGORITHMS)[number];

const NODE_DIGEST: Record<TotpAlgorithm, string> = {
  SHA1: "sha1",
  SHA256: "sha256",
  SHA512: "sha512",
};

export interface TotpParameters {
  /** Base32 (RFC 4648, unpadded) shared secret, as every authenticator app exchanges it. */
  secret: SecretValue;
  algorithm: TotpAlgorithm;
  /** 6 to 8. Six is near-universal; eight is what RFC 6238's own vectors use. */
  digits: number;
  /** Time step in seconds. Thirty is the near-universal default. */
  period: number;
  issuer: string | null;
  account: string | null;
}

export interface TotpParametersInput {
  secret: SecretValue | string;
  algorithm?: TotpAlgorithm;
  digits?: number;
  period?: number;
  issuer?: string | null;
  account?: string | null;
}

/** A generated code together with the window it is valid in. */
export interface TotpCode {
  code: string;
  /** RFC 6238 `T`: the number of time steps since the Unix epoch. */
  counter: number;
  validFromMs: number;
  validUntilMs: number;
  remainingMs: number;
}

export interface TotpVerification {
  valid: boolean;
  /**
   * Which step matched, relative to the caller's clock: `0` is the current
   * step, `-1` the previous one. Null when nothing matched. Surfaced so a
   * persistent non-zero skew is diagnosable as a clock problem rather than
   * being silently absorbed by the window.
   */
  matchedSkewSteps: number | null;
}

/** Validate and normalize TOTP parameters, filling in the conventional defaults. */
export function createTotpParameters(input: TotpParametersInput): TotpParameters {
  const secret = input.secret instanceof SecretValue ? input.secret : new SecretValue(input.secret);
  const algorithm = input.algorithm ?? "SHA1";
  const digits = input.digits ?? 6;
  const period = input.period ?? 30;
  if (!TOTP_ALGORITHMS.includes(algorithm))
    throw new Error(`unsupported totp algorithm: ${algorithm}`);
  if (!Number.isInteger(digits) || digits < 6 || digits > 8)
    throw new Error(`totp digits must be 6 to 8, got ${digits}`);
  if (!Number.isInteger(period) || period <= 0)
    throw new Error(`totp period must be a positive whole number of seconds`);
  // Decoded eagerly so a malformed seed fails when it is stored, not at the
  // moment a login is waiting on a code.
  decodeBase32(secret.reveal());
  return {
    secret,
    algorithm,
    digits,
    period,
    issuer: input.issuer ?? null,
    account: input.account ?? null,
  };
}

/**
 * RFC 4226 HOTP. Takes raw key bytes rather than a base32 string because that is
 * the form RFC 6238's test vectors are published in, and because the TOTP layer
 * above is the only thing that should know about base32.
 */
export function hotpCode(
  key: Uint8Array,
  counter: number | bigint,
  options: { digits?: number; algorithm?: TotpAlgorithm } = {},
): string {
  const digits = options.digits ?? 6;
  const algorithm = options.algorithm ?? "SHA1";
  if (!Number.isInteger(digits) || digits < 6 || digits > 8)
    throw new Error(`hotp digits must be 6 to 8, got ${digits}`);
  const value = BigInt(counter);
  if (value < 0n) throw new Error("hotp counter must not be negative");
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(value);
  const mac = createHmac(NODE_DIGEST[algorithm], Buffer.from(key)).update(message).digest();
  // RFC 4226 5.3 dynamic truncation: the low nibble of the last byte selects a
  // four-byte window, and the high bit is masked off so the result is positive
  // regardless of the platform's signed-integer conventions.
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** The time step containing `atMs`, RFC 6238's `T` with `T0 = 0`. */
export function totpCounter(parameters: TotpParameters, atMs: number): number {
  if (!Number.isFinite(atMs)) throw new Error("totp requires a finite timestamp");
  return Math.floor(Math.floor(atMs / 1_000) / parameters.period);
}

/** Generate the code for the step containing `atMs`. */
export function generateTotp(parameters: TotpParameters, atMs: number): TotpCode {
  const counter = totpCounter(parameters, atMs);
  const stepMs = parameters.period * 1_000;
  const validFromMs = counter * stepMs;
  return {
    code: hotpCode(decodeBase32(parameters.secret.reveal()), counter, {
      digits: parameters.digits,
      algorithm: parameters.algorithm,
    }),
    counter,
    validFromMs,
    validUntilMs: validFromMs + stepMs,
    remainingMs: validFromMs + stepMs - atMs,
  };
}

/**
 * Verify a code against the steps within `window` of `atMs`. A window of 1 —
 * the RFC 6238 §5.2 recommendation — accepts the previous, current, and next
 * step, which covers ordinary clock drift and the time a code spends in transit.
 */
export function verifyTotp(
  parameters: TotpParameters,
  code: string,
  atMs: number,
  options: { window?: number } = {},
): TotpVerification {
  const window = options.window ?? 1;
  if (!Number.isInteger(window) || window < 0)
    throw new Error("totp verification window must be a whole number of steps");
  const candidate = code.trim();
  if (candidate.length !== parameters.digits) return { valid: false, matchedSkewSteps: null };
  const key = decodeBase32(parameters.secret.reveal());
  const base = totpCounter(parameters, atMs);
  let matched: number | null = null;
  // Every step in the window is checked even after a match, so the time taken
  // does not depend on which step was correct.
  for (let skew = -window; skew <= window; skew += 1) {
    const counter = base + skew;
    if (counter < 0) continue;
    const expected = hotpCode(key, counter, {
      digits: parameters.digits,
      algorithm: parameters.algorithm,
    });
    // `-window` is negative zero when the window is zero; normalized so a
    // caller comparing with Object.is, or reading it back out of JSON, sees 0.
    if (constantTimeEquals(expected, candidate) && matched === null)
      matched = skew === 0 ? 0 : skew;
  }
  return { valid: matched !== null, matchedSkewSteps: matched };
}

/* -------------------------------------------------------------------------- */
/* otpauth:// URIs                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Parse the `otpauth://totp/...` URI encoded in every enrolment QR code. HOTP
 * URIs are rejected rather than silently treated as TOTP: a counter-based token
 * needs persisted counter state this vault does not keep.
 */
export function parseOtpauthUri(uri: string): TotpParameters {
  let parsed: URL;
  try {
    parsed = new URL(uri.trim());
  } catch {
    throw new Error("otpauth uri is malformed");
  }
  if (parsed.protocol !== OTPAUTH_SCHEME)
    throw new Error(`otpauth uri requires the otpauth scheme, got ${parsed.protocol}`);
  const kind = decodeURIComponent(parsed.hostname).toLowerCase();
  if (kind !== "totp") throw new Error(`unsupported otpauth type: ${kind || "<missing>"}`);

  const label = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const separator = label.indexOf(":");
  const labelIssuer = separator === -1 ? null : label.slice(0, separator).trim() || null;
  const account = (separator === -1 ? label : label.slice(separator + 1)).trim() || null;

  const secret = parsed.searchParams.get("secret");
  if (!secret) throw new Error("otpauth uri requires a secret parameter");
  const algorithm = (parsed.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
  if (!isTotpAlgorithm(algorithm)) throw new Error(`unsupported otpauth algorithm: ${algorithm}`);

  return createTotpParameters({
    secret: normalizeBase32(secret),
    algorithm,
    digits: numericParameter(parsed.searchParams.get("digits"), 6, "digits"),
    period: numericParameter(parsed.searchParams.get("period"), 30, "period"),
    // The `issuer` parameter wins over the label prefix; the Key Uri Format
    // recommends emitting both and treats the parameter as authoritative.
    issuer: parsed.searchParams.get("issuer") ?? labelIssuer,
    account,
  });
}

/**
 * Emit an `otpauth://totp/...` URI. Built by hand rather than through `URL`
 * because the label's `issuer:account` colon must survive unescaped for the
 * authenticator apps that expect it, while the parts around it are escaped.
 */
export function formatOtpauthUri(parameters: TotpParameters): string {
  const account = parameters.account ?? "";
  const label = parameters.issuer
    ? `${encodeURIComponent(parameters.issuer)}:${encodeURIComponent(account)}`
    : encodeURIComponent(account);
  const query = new URLSearchParams();
  query.set("secret", normalizeBase32(parameters.secret.reveal()));
  if (parameters.issuer) query.set("issuer", parameters.issuer);
  query.set("algorithm", parameters.algorithm);
  query.set("digits", String(parameters.digits));
  query.set("period", String(parameters.period));
  return `otpauth://totp/${label}?${query.toString()}`;
}

/* -------------------------------------------------------------------------- */
/* Base32                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * RFC 4648 base32 decode, tolerant of the shapes humans and QR codes produce:
 * lowercase, `=` padding, and the spaces authenticator apps insert every four
 * characters.
 */
export function decodeBase32(value: string): Uint8Array {
  const normalized = normalizeBase32(value);
  if (normalized.length === 0) throw new Error("base32 secret is empty");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`base32 secret contains an invalid character: ${character}`);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  if (bytes.length === 0) throw new Error("base32 secret decodes to no bytes");
  return Uint8Array.from(bytes);
}

/** RFC 4648 base32 encode, unpadded and uppercase. */
export function encodeBase32(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  return output;
}

/** normalizeBase32 implementation. */
function normalizeBase32(value: string): string {
  return value.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
}

/** isTotpAlgorithm implementation. */
function isTotpAlgorithm(value: string): value is TotpAlgorithm {
  return (TOTP_ALGORITHMS as readonly string[]).includes(value);
}

/**
 * Returns a numeric value parsed from `raw` or uses `fallback` if `raw` is null or empty.
 *
 * @param raw - The string to parse into a number or null.
 * @param fallback - The number to return if `raw` is null or cannot be parsed.
 * @param field - The field name for error messages.
 * @returns The parsed integer or `fallback`.
 * @throws Throws an error if `raw` is not a valid integer.
 */
function numericParameter(raw: string | null, fallback: number, field: string): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error(`otpauth uri has a malformed ${field}: ${raw}`);
  return parsed;
}

/** constantTimeEquals implementation. */
function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Wire codec                                                                  */
/* -------------------------------------------------------------------------- */

export interface TotpParametersPayload {
  secret: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
  issuer: string | null;
  account: string | null;
}

/** encodeTotpParameters implementation. */
export function encodeTotpParameters(parameters: TotpParameters): TotpParametersPayload {
  return {
    secret: parameters.secret.reveal(),
    algorithm: parameters.algorithm,
    digits: parameters.digits,
    period: parameters.period,
    issuer: parameters.issuer,
    account: parameters.account,
  };
}

/**
 * Decodes a TOTP parameters payload into a TOTPParameters object.
 *
 * @param value - The payload to decode, expected to be an object containing TOTP parameters.
 * @param id - The identifier for the stored secret.
 * @returns A TOTPParameters object if decoding is successful.
 * @throws Will throw an error if the payload is malformed or missing required fields.
 */
export function decodeTotpParameters(value: unknown, id: string): TotpParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`stored secret ${id} has malformed totp parameters`);
  }
  const payload = value as Record<string, unknown>;
  const secret = payload.secret;
  const algorithm = payload.algorithm;
  if (typeof secret !== "string" || !secret)
    throw new Error(`stored secret ${id} requires a totp secret`);
  if (typeof algorithm !== "string" || !isTotpAlgorithm(algorithm)) {
    throw new Error(`stored secret ${id} has an unsupported totp algorithm`);
  }
  return createTotpParameters({
    secret,
    algorithm,
    digits: typeof payload.digits === "number" ? payload.digits : 6,
    period: typeof payload.period === "number" ? payload.period : 30,
    issuer: typeof payload.issuer === "string" ? payload.issuer : null,
    account: typeof payload.account === "string" ? payload.account : null,
  });
}
