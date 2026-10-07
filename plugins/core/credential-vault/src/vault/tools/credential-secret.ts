import type { SecretRecord } from "../record.js";
import type { SecretValue } from "../secret.js";
import type { AuthPlacement } from "./auth-placement.js";
import type { VaultToolOperation } from "./tool-outcomes.js";

const ACCOUNT_TAG = "account:";

/** The single string that authenticates this record, or null when there is none. */
export function credentialSecret(record: SecretRecord): SecretValue | null {
  switch (record.material.type) {
    case "api_key":
      return record.material.apiKey;
    case "oauth_token":
      return record.material.accessToken;
    case "password":
      return record.material.password;
    case "cookie_jar":
      return record.material.jar;
    case "generic_note":
      return record.material.note;
    default:
      return null;
  }
}

/**
 * Extracts the account identifier from a secret record.
 *
 * Guarantees a string representing the account identifier if found in the tags
 * or material, or null if no account identifier is present.
 *
 * @param record - The secret record to extract the account identifier from.
 * @returns The account identifier as a string or null if not found.
 */
export function accountOf(record: SecretRecord): string | null {
  const tag = record.tags.find((entry) => entry.startsWith(ACCOUNT_TAG));
  if (tag) return tag.slice(ACCOUNT_TAG.length) || null;
  switch (record.material.type) {
    case "password":
      return record.material.username;
    case "totp_seed":
      return record.material.parameters.account;
    case "passkey":
      return record.material.userName;
    default:
      return null;
  }
}

/**
 * Put the credential on the request. The only function in this module that
 * moves material, and it writes into structures that never come back to the
 * agent: the transport's header map and the transport's URL.
 */
export function applyAuth(
  placement: AuthPlacement,
  record: SecretRecord,
  url: URL,
  headers: Record<string, string>,
): void {
  const secret = credentialSecret(record);
  if (!secret) return;
  switch (placement.kind) {
    case "header":
      headers[placement.header] = `${placement.prefix}${secret.reveal()}`;
      return;
    case "query":
      url.searchParams.set(placement.parameter, secret.reveal());
      return;
    case "basic": {
      const username = record.material.type === "password" ? record.material.username : "";
      headers.Authorization = `Basic ${Buffer.from(`${username}:${secret.reveal()}`, "utf8").toString("base64")}`;
      return;
    }
    case "cookie":
      headers.Cookie = secret.reveal();
      return;
  }
}

/** PEM as-is; anything else is treated as base64 PKCS#8 DER. */
export function privateKeyInput(
  value: string,
): string | { key: Buffer; format: "der"; type: "pkcs8" } {
  if (value.includes("-----BEGIN")) return value;
  return { key: Buffer.from(value, "base64"), format: "der", type: "pkcs8" };
}

/**
 * Determines the audit action type based on the provided VaultToolOperation.
 *
 * Guarantees: Returns one of "tool_fetch", "tool_totp", "tool_process", "tool_sign", or "tool_describe".
 * Must receive a `VaultToolOperation` as input.
 * Fails if the operation is not recognized, returning undefined.
 */
export function auditActionFor(
  operation: VaultToolOperation,
): "tool_fetch" | "tool_totp" | "tool_process" | "tool_sign" | "tool_describe" {
  switch (operation) {
    case "authenticated_fetch":
      return "tool_fetch";
    case "totp_code":
      return "tool_totp";
    case "authenticated_process":
      return "tool_process";
    case "sign":
      return "tool_sign";
    case "describe_credential":
      return "tool_describe";
  }
}
