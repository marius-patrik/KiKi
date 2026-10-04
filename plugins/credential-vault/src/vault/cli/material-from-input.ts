import { SecretValue } from "../secret.js";
import type { SecretMaterial, SecretRecord, SecretType } from "../record.js";
import { createTotpParameters, formatOtpauthUri, parseOtpauthUri } from "../totp.js";
import { VaultCliError } from "./argument-parsing.js";
import { fingerprint, type Fingerprint } from "./fingerprint.js";

export interface MaterialOptions {
  header?: string | null;
  username?: string | null;
  origin?: string | null;
  loginUrl?: string | null;
  publicKey?: string | null;
  issuer?: string | null;
  account?: string | null;
}

/**
 * Turn piped bytes into typed material. Two shapes are accepted for the compound
 * types — a JSON document with the named fields, or a bare string treated as the
 * single most important field — because an owner pasting a token should not have
 * to hand-write JSON, and a script feeding a full token response should not have
 * to take it apart.
 */
export function materialFromInput(
  type: SecretType,
  raw: string,
  options: MaterialOptions = {},
): SecretMaterial {
  const text = raw.trim();
  if (!text) throw new VaultCliError("no secret material was supplied on stdin");
  switch (type) {
    case "api_key":
      return { type: "api_key", apiKey: new SecretValue(text), header: options.header ?? null };
    case "oauth_token": {
      const document = jsonObject(text);
      if (!document)
        return {
          type: "oauth_token",
          accessToken: new SecretValue(text),
          refreshToken: null,
          refreshTokenExpiresAt: null,
          scopes: [],
          subscriptionType: null,
          tokenEndpoint: null,
        };
      const accessToken =
        stringField(document, "accessToken") ?? stringField(document, "access_token");
      if (!accessToken) throw new VaultCliError("oauth material needs an accessToken field");
      const refreshToken =
        stringField(document, "refreshToken") ?? stringField(document, "refresh_token");
      return {
        type: "oauth_token",
        accessToken: new SecretValue(accessToken),
        refreshToken: refreshToken ? new SecretValue(refreshToken) : null,
        refreshTokenExpiresAt: stringField(document, "refreshTokenExpiresAt"),
        scopes: Array.isArray(document.scopes)
          ? document.scopes.filter((entry): entry is string => typeof entry === "string")
          : [],
        subscriptionType: stringField(document, "subscriptionType"),
        tokenEndpoint: stringField(document, "tokenEndpoint"),
      };
    }
    case "password": {
      const username = options.username?.trim();
      if (!username) throw new VaultCliError("--username is required for a password record");
      return {
        type: "password",
        username,
        password: new SecretValue(text),
        origin: options.origin ?? null,
        loginUrl: options.loginUrl ?? null,
      };
    }
    case "totp_seed":
      return { type: "totp_seed", parameters: totpParametersFromInput(text, options) };
    case "passkey": {
      const document = jsonObject(text);
      if (!document) throw new VaultCliError("passkey material must be a JSON document");
      const privateKey = stringField(document, "privateKey");
      const credentialId = stringField(document, "credentialId");
      const relyingPartyId = stringField(document, "relyingPartyId");
      if (!privateKey || !credentialId || !relyingPartyId) {
        throw new VaultCliError(
          "passkey material needs credentialId, relyingPartyId and privateKey",
        );
      }
      return {
        type: "passkey",
        credentialId,
        relyingPartyId,
        userHandle: stringField(document, "userHandle") ?? "",
        userName: stringField(document, "userName") ?? "",
        coseAlgorithm: typeof document.coseAlgorithm === "number" ? document.coseAlgorithm : -7,
        privateKey: new SecretValue(privateKey),
        signCount: typeof document.signCount === "number" ? document.signCount : 0,
        transports: Array.isArray(document.transports)
          ? document.transports.filter((entry): entry is string => typeof entry === "string")
          : [],
        userVerificationRequired: document.userVerificationRequired === true,
      };
    }
    case "cookie_jar": {
      const origin = options.origin?.trim();
      if (!origin) throw new VaultCliError("--origin is required for a cookie_jar record");
      return { type: "cookie_jar", origin, jar: new SecretValue(text), sessionExpiresAt: null };
    }
    case "recovery_codes": {
      const codes = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (codes.length === 0) throw new VaultCliError("no recovery codes were supplied");
      return {
        type: "recovery_codes",
        codes: codes.map((code) => new SecretValue(code)),
        consumed: 0,
      };
    }
    case "ssh_key":
      return {
        type: "ssh_key",
        privateKey: new SecretValue(text),
        publicKey: options.publicKey?.trim() || "",
        passphrase: null,
        fingerprint: null,
        comment: null,
      };
    case "generic_note":
      return { type: "generic_note", note: new SecretValue(text) };
  }
}

/** An `otpauth://` URI or a bare base32 seed, whichever the owner pasted. */
export function totpParametersFromInput(raw: string, options: MaterialOptions = {}) {
  const text = raw.trim();
  if (text.toLowerCase().startsWith("otpauth://")) return parseOtpauthUri(text);
  return createTotpParameters({
    secret: text,
    issuer: options.issuer ?? null,
    account: options.account ?? null,
  });
}

/**
 * Parses a JSON string into an object if valid, or returns null if invalid.
 *
 * @param text - The JSON string to parse.
 * @returns The parsed object if valid JSON and an object, otherwise null.
 */
function jsonObject(text: string): Record<string, unknown> | null {
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Retrieves the value of a specified field from a document as a string if it exists and is non-empty.
 *
 * @param document - The document from which to retrieve the field value.
 * @param field - The field name to retrieve.
 * @returns The string value of the field if it exists and is non-empty, otherwise null.
 */
export function stringField(document: Record<string, unknown>, field: string): string | null {
  const value = document[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The field `vault get` yields for each type, and the one every other command
 * refuses to touch. Centralised so a new secret type cannot quietly become
 * unreadable, or readable through an unintended field.
 */
export function revealField(record: SecretRecord, field: string | null): string {
  const material = record.material;
  switch (material.type) {
    case "api_key":
      return material.apiKey.reveal();
    case "oauth_token":
      if (field === "refreshToken") {
        if (!material.refreshToken) throw new VaultCliError(`${record.id} has no refresh token`);
        return material.refreshToken.reveal();
      }
      return material.accessToken.reveal();
    case "password":
      return field === "username" ? material.username : material.password.reveal();
    case "totp_seed":
      return field === "uri"
        ? formatOtpauthUri(material.parameters)
        : material.parameters.secret.reveal();
    case "passkey":
      return material.privateKey.reveal();
    case "cookie_jar":
      return material.jar.reveal();
    case "recovery_codes":
      return material.codes.map((code) => code.reveal()).join("\n");
    case "ssh_key":
      return field === "publicKey" ? material.publicKey : material.privateKey.reveal();
    case "generic_note":
      return material.note.reveal();
  }
}

/** Fingerprints for everything secret in a record, for `list` and `scan`. */
export function fingerprintsOf(material: SecretMaterial): Fingerprint[] {
  switch (material.type) {
    case "api_key":
      return [fingerprint("apiKey", material.apiKey.reveal())];
    case "oauth_token":
      return [
        fingerprint("accessToken", material.accessToken.reveal()),
        ...(material.refreshToken
          ? [fingerprint("refreshToken", material.refreshToken.reveal())]
          : []),
      ];
    case "password":
      return [fingerprint("password", material.password.reveal())];
    case "totp_seed":
      return [fingerprint("secret", material.parameters.secret.reveal())];
    case "passkey":
      return [fingerprint("privateKey", material.privateKey.reveal())];
    case "cookie_jar":
      return [fingerprint("jar", material.jar.reveal())];
    case "recovery_codes":
      return material.codes.slice(0, 1).map((code) => fingerprint("codes[0]", code.reveal()));
    case "ssh_key":
      return [fingerprint("privateKey", material.privateKey.reveal())];
    case "generic_note":
      return [fingerprint("note", material.note.reveal())];
  }
}
