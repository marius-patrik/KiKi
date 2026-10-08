/**
 * The secret record model: what the vault stores, who may read it, and when it
 * stops being valid.
 *
 * `src/engine/providers/credentials.ts` models exactly the two things a model
 * provider needs — an API key and an OAuth token pair. That is the right shape
 * for that seam and it is left alone. This module is the wider one: the vault
 * has to hold the whole set of things an agent needs in order to never hand a
 * login screen back to its owner, which includes material the provider harness
 * has no opinion about (a website password, a TOTP seed, a WebAuthn resident
 * credential, a browser cookie jar, printed recovery codes, an SSH key).
 *
 * Two deliberate splits.
 *
 * First, metadata is validated with a schema and material is hand-coded.
 * Metadata is ordinary data and benefits from a schema; material carries
 * `SecretValue`, and `secret.ts` establishes the house rule that secret-bearing
 * structures get explicit field-by-field codecs so plaintext only ever moves
 * through a visible `reveal()` and a new secret field cannot be serialized by
 * accident. A schema over material would undo that. Andromeda used zod for the
 * metadata schema; this port translates it to schemastery through the
 * zod-compatible surface in `zod.ts`, which keeps the two zod behaviors the
 * metadata schema relies on — unknown keys rejected by `strictObject`, and
 * `safeParse` reporting every failing path at once.
 *
 * Second, every record carries a `purpose` as well as an `id`. The id is the
 * storage key; the purpose is the thing being logged into ("github",
 * "aws-console"). Records sharing a purpose are the login for the same account,
 * which is what lets the re-auth supervisor answer "can I get back in without
 * the owner?" — a dead `oauth_token` for purpose `github` is recoverable when a
 * `password` and a `totp_seed` for `github` are also in the vault, and is not
 * otherwise.
 *
 * `passkey` and `cookie_jar` are modelled here in full but nothing in this slice
 * signs a WebAuthn assertion or drives a browser. They are declared now so the
 * automation slice adds behaviour rather than a storage migration, exactly as
 * `secret.ts` declared its `oauth` variant ahead of the OAuth slice.
 * @module credentials/vault/record
 */

import { randomUUID } from "node:crypto";
import { z } from "./zod.js";
import { SecretValue } from "./secret.js";
import type { TotpParameters } from "./totp.js";
import { decodeTotpParameters, encodeTotpParameters, type TotpParametersPayload } from "./totp.js";

const SECRET_ID = /^[a-z][a-z0-9-]*$/;
const PURPOSE = /^[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*$/;

/**
 * Every kind of material the vault holds. Closed on purpose: an agent decides
 * what it can do with a secret by switching on this discriminant, and an open
 * shape would make "can this be renewed automatically?" unanswerable.
 */
export const SECRET_TYPES = [
  "api_key",
  "oauth_token",
  "password",
  "totp_seed",
  "passkey",
  "cookie_jar",
  "recovery_codes",
  "ssh_key",
  "generic_note",
] as const;

export type SecretType = (typeof SECRET_TYPES)[number];

/**
 * Who may read a record. Two axes because they fail differently: a workspace
 * boundary keeps one project's credentials out of another's, and an agent
 * boundary keeps a narrow worker from reading the owner's whole keychain just
 * because it runs in the right directory.
 *
 * `"*"` is an explicit wildcard on either axis. An empty `agents` list denies
 * everyone, so a record whose scope was never filled in is unreadable rather
 * than world-readable — the failure mode of a scope typo should be an outage,
 * not a leak.
 */
export const SecretScopeSchema = z.strictObject({
  workspace: z.string().min(1),
  agents: z.array(z.string().min(1)).readonly(),
});

export type SecretScope = z.infer<typeof SecretScopeSchema>;

/** The caller identity a scope is checked against. */
export interface AgentIdentity {
  workspace: string;
  agent: string;
}

const IsoDateTime = z.string().refine((value) => Number.isFinite(Date.parse(value)), {
  message: "must be an ISO 8601 timestamp",
});

export const SecretMetadataSchema = z.strictObject({
  /** Stable storage key and filename stem. */
  id: z.string().regex(SECRET_ID),
  type: z.enum(SECRET_TYPES),
  /** Human-facing name. Never contains secret material. */
  label: z.string().min(1),
  /**
   * The account or system this record authenticates against, for example
   * `github` or `aws/production`. Records sharing a purpose describe one login.
   */
  purpose: z.string().regex(PURPOSE),
  scope: SecretScopeSchema,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Null when the material does not expire, which is normal for an API key. */
  expiresAt: IsoDateTime.nullable(),
  tags: z.array(z.string().min(1)).readonly(),
  /**
   * Correlation id for this record's audit entries. Survives rotation, so the
   * history of a credential is followable across new material under the same id.
   */
  auditRef: z.string().min(1),
});

export type SecretMetadata = z.infer<typeof SecretMetadataSchema>;

/**
 * Secret material, one variant per type. Every field that would be damaging in
 * a log is a `SecretValue`; fields that are transmitted in the clear during
 * normal protocol use (a WebAuthn credential id, an SSH public key) are plain
 * strings, because wrapping them would dilute what `SecretValue` signals.
 */
export type SecretMaterial =
  | {
      type: "api_key";
      apiKey: SecretValue;
      /** Header the key is sent in, when the record knows. Null defers to the provider descriptor. */
      header: string | null;
    }
  | {
      type: "oauth_token";
      accessToken: SecretValue;
      refreshToken: SecretValue | null;
      refreshTokenExpiresAt: string | null;
      scopes: readonly string[];
      subscriptionType: string | null;
      /** Token endpoint, when the record is self-describing rather than descriptor-backed. */
      tokenEndpoint: string | null;
    }
  | {
      type: "password";
      username: string;
      password: SecretValue;
      /** Origin the password belongs to, used to match a cookie jar or passkey. */
      origin: string | null;
      loginUrl: string | null;
    }
  | {
      type: "totp_seed";
      parameters: TotpParameters;
    }
  | {
      /**
       * A WebAuthn resident credential. Declared in full; this slice stores and
       * round-trips it and performs no assertion. `userVerificationRequired`
       * is the field that decides whether the later signing slice can act
       * unattended: a relying party demanding user verification against a
       * platform authenticator wants a gesture no software can produce.
       */
      type: "passkey";
      /** Base64url credential id. Sent in the clear during an assertion. */
      credentialId: string;
      relyingPartyId: string;
      /** Base64url user handle. */
      userHandle: string;
      userName: string;
      /** COSE algorithm identifier, for example -7 for ES256. */
      coseAlgorithm: number;
      /** PKCS#8 private key. Secret: possession of it is the authenticator. */
      privateKey: SecretValue;
      signCount: number;
      transports: readonly string[];
      userVerificationRequired: boolean;
    }
  | {
      /**
       * A browser session. The jar is one secret rather than a structure
       * because any cookie in it may be the session bearer, and a partial
       * redaction that guesses wrong leaks the whole session.
       */
      type: "cookie_jar";
      origin: string;
      jar: SecretValue;
      sessionExpiresAt: string | null;
    }
  | {
      type: "recovery_codes";
      codes: readonly SecretValue[];
      /** How many of the codes have been spent, so the supervisor can warn before they run out. */
      consumed: number;
    }
  | {
      type: "ssh_key";
      privateKey: SecretValue;
      /** Public half, published by design. */
      publicKey: string;
      passphrase: SecretValue | null;
      fingerprint: string | null;
      comment: string | null;
    }
  | {
      type: "generic_note";
      note: SecretValue;
    };

/**
 * A stored record: metadata and material, with the discriminant shared so
 * `record.type === "totp_seed"` narrows `record.material` too.
 */
export type SecretRecord = {
  [T in SecretType]: Omit<SecretMetadata, "type"> & {
    type: T;
    material: Extract<SecretMaterial, { type: T }>;
  };
}[SecretType];

/** A record with its material stripped: safe to log, return, or serialize. */
export type SecretDescriptor = SecretMetadata;

export interface CreateSecretRecordInput {
  id: string;
  label: string;
  purpose: string;
  scope: SecretScope;
  material: SecretMaterial;
  expiresAt?: string | null;
  tags?: readonly string[];
  auditRef?: string;
  now?: () => number;
}

/** Mint a record, validating metadata and stamping both timestamps. */
export function createSecretRecord(input: CreateSecretRecordInput): SecretRecord {
  const at = new Date((input.now ?? Date.now)()).toISOString();
  const metadata = parseSecretMetadata({
    id: input.id,
    type: input.material.type,
    label: input.label,
    purpose: input.purpose,
    scope: input.scope,
    createdAt: at,
    updatedAt: at,
    expiresAt: input.expiresAt ?? null,
    tags: input.tags ? [...input.tags] : [],
    auditRef: input.auditRef ?? randomUUID(),
  });
  return bind(metadata, input.material);
}

/** Replace material, advancing `updatedAt` and keeping the audit correlation. */
export function rotateSecretRecord(
  record: SecretRecord,
  material: SecretMaterial,
  options: { expiresAt?: string | null; now?: () => number } = {},
): SecretRecord {
  if (material.type !== record.type) {
    throw new Error(`cannot rotate ${record.id} from ${record.type} to ${material.type}`);
  }
  const metadata = parseSecretMetadata({
    ...descriptorOf(record),
    updatedAt: new Date((options.now ?? Date.now)()).toISOString(),
    expiresAt: options.expiresAt === undefined ? record.expiresAt : options.expiresAt,
  });
  return bind(metadata, material);
}

/** Validate metadata, reporting every failing field path at once. */
export function parseSecretMetadata(value: unknown): SecretMetadata {
  const result = SecretMetadataSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `invalid secret metadata: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

/**
 * The record without its material. Everything that reports on the vault — the
 * health view, the audit log, an error message — goes through this, so there is
 * no path where a caller has to remember to strip material by hand.
 */
export function descriptorOf(record: SecretRecord): SecretDescriptor {
  return {
    id: record.id,
    type: record.type,
    label: record.label,
    purpose: record.purpose,
    scope: { workspace: record.scope.workspace, agents: [...record.scope.agents] },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    tags: [...record.tags],
    auditRef: record.auditRef,
  };
}

/**
 * Whether `identity` may read a record with this scope. Wildcards are explicit
 * and an empty agent list denies everyone; there is no implicit allow.
 */
export function scopeAllows(scope: SecretScope, identity: AgentIdentity): boolean {
  const workspaceOk = scope.workspace === "*" || scope.workspace === identity.workspace;
  if (!workspaceOk) return false;
  return scope.agents.some((agent) => agent === "*" || agent === identity.agent);
}

/** True when the record's own expiry has passed. Material-level expiry is separate. */
export function isExpired(record: SecretRecord, nowMs: number): boolean {
  if (!record.expiresAt) return false;
  const expiresAt = Date.parse(record.expiresAt);
  return Number.isFinite(expiresAt) && nowMs >= expiresAt;
}

/**
 * The moment the record stops working, taking the tightest of the record's own
 * expiry and any expiry inside its material. Null means it does not expire.
 */
export function effectiveExpiryMs(record: SecretRecord): number | null {
  const candidates: number[] = [];
  /**
   * Adds the given expiration value to the candidates list if it's a valid date.
   * Returns the earliest valid expiration date from the candidates list or null if none.
   *
   * @param value - The expiration value to check and add to candidates.
   * @returns The earliest valid expiration date or null if no valid dates are found.
   */
  const push = (value: string | null) => {
    if (!value) return;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) candidates.push(parsed);
  };
  push(record.expiresAt);
  if (record.material.type === "cookie_jar") push(record.material.sessionExpiresAt);
  return candidates.length === 0 ? null : Math.min(...candidates);
}

/**
 * Binds metadata to a secret material ensuring they match in type.
 * @param metadata - The metadata describing the secret.
 * @param material - The secret material to bind.
 * @returns A SecretRecord if the types match, otherwise throws an error.
 */
function bind(metadata: SecretMetadata, material: SecretMaterial): SecretRecord {
  if (metadata.type !== material.type) {
    throw new Error(
      `secret ${metadata.id} declares type ${metadata.type} but carries ${material.type} material`,
    );
  }
  return { ...metadata, material } as SecretRecord;
}

/* -------------------------------------------------------------------------- */
/* Wire codecs                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The plaintext shape written inside the encrypted envelope. Every secret field
 * is a plain string here, which is the point: the transition from `SecretValue`
 * to `string` happens in exactly two functions, both below, and both immediately
 * adjacent to the cipher.
 */
export type SecretMaterialPayload =
  | { type: "api_key"; apiKey: string; header: string | null }
  | {
      type: "oauth_token";
      accessToken: string;
      refreshToken: string | null;
      refreshTokenExpiresAt: string | null;
      scopes: string[];
      subscriptionType: string | null;
      tokenEndpoint: string | null;
    }
  | {
      type: "password";
      username: string;
      password: string;
      origin: string | null;
      loginUrl: string | null;
    }
  | { type: "totp_seed"; parameters: TotpParametersPayload }
  | {
      type: "passkey";
      credentialId: string;
      relyingPartyId: string;
      userHandle: string;
      userName: string;
      coseAlgorithm: number;
      privateKey: string;
      signCount: number;
      transports: string[];
      userVerificationRequired: boolean;
    }
  | { type: "cookie_jar"; origin: string; jar: string; sessionExpiresAt: string | null }
  | { type: "recovery_codes"; codes: string[]; consumed: number }
  | {
      type: "ssh_key";
      privateKey: string;
      publicKey: string;
      passphrase: string | null;
      fingerprint: string | null;
      comment: string | null;
    }
  | { type: "generic_note"; note: string };

export interface SecretRecordPayload {
  metadata: SecretMetadata;
  material: SecretMaterialPayload;
}

/**
 * Encodes a secret record into a SecretRecordPayload.
 *
 * Guarantees:
 * - Returns a SecretRecordPayload containing the metadata and material of the secret record.
 * - Metadata and material are derived from the input secret record.
 * - Fails if the input record does not conform to the expected SecretRecord shape.
 */
export function encodeSecretRecord(record: SecretRecord): SecretRecordPayload {
  return { metadata: descriptorOf(record), material: encodeSecretMaterial(record.material) };
}

/**
 * Decodes a secret record into its respective payload format.
 *
 * Guarantees:
 * - Returns a SecretRecordPayload with metadata and material based on the secret record type.
 * - Fails if the input record does not match any recognized secret record type.
 */
export function decodeSecretRecord(value: unknown, id: string): SecretRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`stored secret is not an object: ${id}`);
  }
  const record = value as Record<string, unknown>;
  const metadata = parseSecretMetadata(record.metadata);
  if (metadata.id !== id)
    throw new Error(`stored secret ${id} carries a mismatched id: ${metadata.id}`);
  return bind(metadata, decodeSecretMaterial(record.material, id));
}

/** encodeSecretMaterial implementation. */
function encodeSecretMaterial(material: SecretMaterial): SecretMaterialPayload {
  switch (material.type) {
    case "api_key":
      return { type: "api_key", apiKey: material.apiKey.reveal(), header: material.header };
    case "oauth_token":
      return {
        type: "oauth_token",
        accessToken: material.accessToken.reveal(),
        refreshToken: material.refreshToken ? material.refreshToken.reveal() : null,
        refreshTokenExpiresAt: material.refreshTokenExpiresAt,
        scopes: [...material.scopes],
        subscriptionType: material.subscriptionType,
        tokenEndpoint: material.tokenEndpoint,
      };
    case "password":
      return {
        type: "password",
        username: material.username,
        password: material.password.reveal(),
        origin: material.origin,
        loginUrl: material.loginUrl,
      };
    case "totp_seed":
      return { type: "totp_seed", parameters: encodeTotpParameters(material.parameters) };
    case "passkey":
      return {
        type: "passkey",
        credentialId: material.credentialId,
        relyingPartyId: material.relyingPartyId,
        userHandle: material.userHandle,
        userName: material.userName,
        coseAlgorithm: material.coseAlgorithm,
        privateKey: material.privateKey.reveal(),
        signCount: material.signCount,
        transports: [...material.transports],
        userVerificationRequired: material.userVerificationRequired,
      };
    case "cookie_jar":
      return {
        type: "cookie_jar",
        origin: material.origin,
        jar: material.jar.reveal(),
        sessionExpiresAt: material.sessionExpiresAt,
      };
    case "recovery_codes":
      return {
        type: "recovery_codes",
        codes: material.codes.map((code) => code.reveal()),
        consumed: material.consumed,
      };
    case "ssh_key":
      return {
        type: "ssh_key",
        privateKey: material.privateKey.reveal(),
        publicKey: material.publicKey,
        passphrase: material.passphrase ? material.passphrase.reveal() : null,
        fingerprint: material.fingerprint,
        comment: material.comment,
      };
    case "generic_note":
      return { type: "generic_note", note: material.note.reveal() };
  }
}

/** decodeSecretMaterial implementation. */
function decodeSecretMaterial(value: unknown, id: string): SecretMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`stored secret has no material: ${id}`);
  }
  const material = value as Record<string, unknown>;
  switch (material.type) {
    case "api_key":
      return {
        type: "api_key",
        apiKey: new SecretValue(requireString(material.apiKey, "apiKey", id)),
        header: optionalString(material.header, "header", id),
      };
    case "oauth_token": {
      const refreshToken = optionalString(material.refreshToken, "refreshToken", id);
      return {
        type: "oauth_token",
        accessToken: new SecretValue(requireString(material.accessToken, "accessToken", id)),
        refreshToken: refreshToken === null ? null : new SecretValue(refreshToken),
        refreshTokenExpiresAt: optionalString(
          material.refreshTokenExpiresAt,
          "refreshTokenExpiresAt",
          id,
        ),
        scopes: requireStringArray(material.scopes, "scopes", id),
        subscriptionType: optionalString(material.subscriptionType, "subscriptionType", id),
        tokenEndpoint: optionalString(material.tokenEndpoint, "tokenEndpoint", id),
      };
    }
    case "password":
      return {
        type: "password",
        username: requireString(material.username, "username", id),
        password: new SecretValue(requireString(material.password, "password", id)),
        origin: optionalString(material.origin, "origin", id),
        loginUrl: optionalString(material.loginUrl, "loginUrl", id),
      };
    case "totp_seed":
      return { type: "totp_seed", parameters: decodeTotpParameters(material.parameters, id) };
    case "passkey": {
      const privateKey = optionalString(material.privateKey, "privateKey", id);
      if (privateKey === null) throw new Error(`stored secret ${id} requires privateKey`);
      return {
        type: "passkey",
        credentialId: requireString(material.credentialId, "credentialId", id),
        relyingPartyId: requireString(material.relyingPartyId, "relyingPartyId", id),
        userHandle: requireString(material.userHandle, "userHandle", id),
        userName: requireString(material.userName, "userName", id),
        coseAlgorithm: requireFiniteNumber(material.coseAlgorithm, "coseAlgorithm", id),
        privateKey: new SecretValue(privateKey),
        signCount: requireFiniteNumber(material.signCount, "signCount", id),
        transports: requireStringArray(material.transports, "transports", id),
        userVerificationRequired: material.userVerificationRequired === true,
      };
    }
    case "cookie_jar":
      return {
        type: "cookie_jar",
        origin: requireString(material.origin, "origin", id),
        jar: new SecretValue(requireString(material.jar, "jar", id)),
        sessionExpiresAt: optionalString(material.sessionExpiresAt, "sessionExpiresAt", id),
      };
    case "recovery_codes":
      return {
        type: "recovery_codes",
        codes: requireStringArray(material.codes, "codes", id).map((code) => new SecretValue(code)),
        consumed: requireFiniteNumber(material.consumed, "consumed", id),
      };
    case "ssh_key": {
      const passphrase = optionalString(material.passphrase, "passphrase", id);
      return {
        type: "ssh_key",
        privateKey: new SecretValue(requireString(material.privateKey, "privateKey", id)),
        publicKey: requireString(material.publicKey, "publicKey", id),
        passphrase: passphrase === null ? null : new SecretValue(passphrase),
        fingerprint: optionalString(material.fingerprint, "fingerprint", id),
        comment: optionalString(material.comment, "comment", id),
      };
    }
    case "generic_note":
      return {
        type: "generic_note",
        note: new SecretValue(requireString(material.note, "note", id)),
      };
    default:
      throw new Error(`stored secret has an unsupported type: ${id}`);
  }
}

/** requireString implementation. */
function requireString(value: unknown, field: string, id: string): string {
  // jscpd:ignore-start -- mirrors vault/secret.ts's small field-normalizing block for a different record type
  if (typeof value !== "string" || !value) throw new Error(`stored secret ${id} requires ${field}`);
  return value;
}

/**
 * Ensures the provided value is a non-empty string, throwing an error if not.
 *
 * @param value - The value to check.
 * @param field - The name of the field being checked.
 * @param id - The identifier for the stored secret.
 * @returns The value if it is a non-empty string.
 * @throws Will throw an error if the value is not a non-empty string.
 */
function optionalString(value: unknown, field: string, id: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`stored secret ${id} has a malformed ${field}`);
  // jscpd:ignore-end
  return value;
}

/** requireStringArray implementation. */
function requireStringArray(value: unknown, field: string, id: string): string[] {
  if (!Array.isArray(value)) throw new Error(`stored secret ${id} has a malformed ${field}`);
  return value.map((entry) => requireString(entry, field, id));
}

/** requireFiniteNumber implementation. */
function requireFiniteNumber(value: unknown, field: string, id: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`stored secret ${id} has a malformed ${field}`);
  return value;
}
