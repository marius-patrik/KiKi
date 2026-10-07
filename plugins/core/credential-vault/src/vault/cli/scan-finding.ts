import type { SecretMaterial, SecretType } from "../record.js";
import type { CredentialSource } from "./credential-source.js";
import { fingerprint, type Fingerprint } from "./fingerprint.js";

/**
 * How a credential is paid for. The distinction the owner asked to see: a
 * subscription login is a seat that expires and must be re-authenticated, a
 * metered key is a string that bills per call and usually never expires. They
 * fail differently and they cost differently.
 */
export type CredentialPlan = "subscription" | "metered_api_key" | "unknown";

export interface CredentialOrigin {
  machine: string;
  kind: "file" | "keychain" | "environment";
  /** File path, keychain service, or variable name. Never a value. */
  location: string;
  detectedAt: string;
}

export interface Finding {
  detector: string;
  provider: string;
  type: SecretType;
  suggestedId: string;
  label: string;
  purpose: string;
  /** Email, login, or account id — how the owner tells two logins apart. */
  account: string | null;
  expiresAt: string | null;
  plan: CredentialPlan;
  origin: CredentialOrigin;
  fingerprints: readonly Fingerprint[];
  notes: readonly string[];
  /**
   * The material, held only in memory and only until an import writes it. Never
   * serialized: `redactFinding` is the only thing that turns a finding into
   * something printable, and it drops this field.
   */
  material: SecretMaterial | null;
}

/** A finding with its material removed. The only shape that is ever printed. */
export type RedactedFinding = Omit<Finding, "material"> & { importable: boolean; expired: boolean };

/** redactFinding implementation. */
export function redactFinding(finding: Finding, nowMs: number): RedactedFinding {
  const expiresAtMs = finding.expiresAt ? Date.parse(finding.expiresAt) : Number.NaN;
  return {
    detector: finding.detector,
    provider: finding.provider,
    type: finding.type,
    suggestedId: finding.suggestedId,
    label: finding.label,
    purpose: finding.purpose,
    account: finding.account,
    expiresAt: finding.expiresAt,
    plan: finding.plan,
    origin: { ...finding.origin },
    fingerprints: finding.fingerprints.map((print) => ({ ...print })),
    notes: [...finding.notes],
    importable: finding.material !== null,
    expired: Number.isFinite(expiresAtMs) && nowMs >= expiresAtMs,
  };
}

export interface ScanContext {
  now(): number;
  /**
   * Whether this scan may ask the OS to **release** secret material, accepting
   * that on macOS that can put a modal dialog in front of the owner once per
   * item. False in every scan that has not been told otherwise, because the
   * caller who can answer "is a human watching this?" is the one invoking the
   * command, and a default of true answers it wrongly and silently.
   *
   * Required rather than optional so that a future construction site has to
   * decide. An optional flag defaulting to false reads the same at the one call
   * site that exists today and fails open the moment someone spreads a partial
   * context.
   */
  readonly releaseSecrets: boolean;
}

/**
 * One credential source shape. Adding support for a new tool is a new `Detector`
 * in `DETECTORS` and nothing else: the reporting, the redaction, the import path
 * and the provenance stamping are all shared.
 */
export interface Detector {
  readonly name: string;
  readonly provider: string;
  detect(source: CredentialSource, context: ScanContext): Promise<Finding[]>;
}

/** origin implementation. */
export function origin(
  source: CredentialSource,
  kind: CredentialOrigin["kind"],
  location: string,
  context: ScanContext,
): CredentialOrigin {
  return {
    machine: source.machine,
    kind,
    location,
    detectedAt: new Date(context.now()).toISOString(),
  };
}

/** Record ids are `[a-z][a-z0-9-]*`; anything else is folded into that alphabet. */
export function slugify(...parts: (string | null | undefined)[]): string {
  const joined = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = joined.replace(/^[^a-z]+/, "");
  return slug || "secret";
}

/** Non-secret JWT claims. Used for expiry and account identity, never for material. */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Returns the ISO 8601 formatted string of the given value if it represents a valid date.
 * Guarantees a string in ISO format if the value is a finite number of milliseconds or seconds.
 * Returns null if the value is not a valid number or if the date is invalid.
 */
export function claimString(claims: Record<string, unknown> | null, key: string): string | null {
  const value = claims?.[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * Converts a given value to an ISO 8601 date string if it represents a valid date.
 * Guarantees an ISO date string for finite numbers representing milliseconds or seconds.
 * Returns null if the value is not a valid number or if the date is invalid.
 */
export function isoFromSeconds(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1_000).toISOString()
    : null;
}

/** isoFromMilliseconds implementation. */
export function isoFromMilliseconds(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

/**
 * Converts a given text value to an ISO 8601 date string if it represents a valid date.
 * Guarantees an ISO date string for finite numbers representing milliseconds or seconds
 * when parsed as text. Returns null if the value is not a string, not a valid number, or
 * if the date is invalid upon parsing.
 */
export function isoFromText(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Parses a JSON string into an object.
 * Guarantees an object if the JSON string is valid and represents an object.
 * Returns null if the input is null, not a string, or if the JSON string is invalid.
 */
export function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** record implementation. */
export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
