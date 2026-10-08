/**
 * Why a capability was refused.
 *
 * "there is no such credential" and "that credential is not yours" are both
 * `out_of_scope`, deliberately and for the same reason `agent.ts` gives them one
 * message: an agent must not be able to map the vault by probing purposes. The
 * audit trail, which the agent never reads, keeps the distinction.
 */
export const VAULT_DENIALS = [
  "out_of_scope",
  "wrong_credential_type",
  "auth_placement_unknown",
  "no_allowed_hosts",
  "host_not_allowed",
  "agent_supplied_auth",
  "insecure_scheme",
  "url_credentials",
  "malformed_url",
  "method_not_allowed",
  "body_not_allowed",
  "rate_limited",
  "command_not_permitted",
  "capability_unavailable",
  "human_presence_required",
  "transport_failure",
  "invalid_argument",
] as const;

export type VaultDenialReason = (typeof VAULT_DENIALS)[number];

export interface VaultToolDenial {
  ok: false;
  denial: VaultDenialReason;
  /** Plain explanation. Never contains material, and never distinguishes a miss from a denial. */
  detail: string;
}

/** Every tool answers with this shape. The failure arm carries no material either. */
export type VaultToolResult<T> = ({ ok: true } & T) | VaultToolDenial;

/** The capability that ran. Doubles as the audit vocabulary. */
export type VaultToolOperation =
  | "authenticated_fetch"
  | "totp_code"
  | "authenticated_process"
  | "sign"
  | "describe_credential";
