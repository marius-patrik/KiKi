import type { SecretType } from "../record.js";
import type { CredentialState, ReauthStrategy } from "../supervisor.js";

export interface AuthenticatedFetchRequest {
  url: string;
  method?: string;
  headers?: Readonly<Record<string, string>>;
  body?: string | null;
  /** Disambiguates when several in-scope credentials share a purpose. */
  credentialId?: string;
}

export interface CredentialHealthSummary {
  state: CredentialState;
  strategy: ReauthStrategy;
  selfHealing: boolean;
  humanPresenceRequired: boolean;
  nextRefreshAt: string | null;
  attempts: number;
}

/** Everything an agent may know about a credential. Material is not on the list. */
export interface CredentialSummary {
  id: string;
  type: SecretType;
  purpose: string;
  label: string;
  /** Provider descriptor id when the purpose names one, else null. */
  provider: string | null;
  /** Login name, TOTP account, or passkey user. Never a secret in this model. */
  account: string | null;
  expiresAt: string | null;
  updatedAt: string;
  allowedHosts: readonly string[];
  tags: readonly string[];
  health: CredentialHealthSummary | null;
}

export interface AuthenticatedFetchOk {
  status: number;
  statusText: string;
  /** Response headers, scrubbed of anything that would hand back a credential. */
  headers: Readonly<Record<string, string>>;
  body: string;
  /** Host the credential was actually presented to. */
  host: string;
  /**
   * Location of a redirect that was deliberately not followed. Re-issuing
   * against it costs another allow-list check, which is the point.
   */
  redirectedTo: string | null;
  credential: CredentialSummary;
}

export interface TotpCodeOk {
  /** Six to eight digits. Valid for one step and then worthless. */
  code: string;
  digits: number;
  validUntil: string;
  remainingMs: number;
  credentialId: string;
  purpose: string;
}

export interface AuthenticatedProcessRequest {
  command: string;
  args?: readonly string[];
  cwd?: string;
  /** Extra environment for the child. Cannot name the credential variable. */
  env?: Readonly<Record<string, string>>;
  /** Variable the credential is bound to inside the child. Default `ANDROMEDA_VAULT_SECRET`. */
  credentialEnv?: string;
  credentialId?: string;
}

export interface AuthenticatedProcessOk {
  exitCode: number;
  /** Scrubbed of the injected credential, in case the child echoed it. */
  stdout: string;
  stderr: string;
  command: string;
  credentialId: string;
}

export interface GitRequest {
  /** Must be an absolute https URL: a bare remote name has no host to check. */
  remote: string;
  refspec?: string;
  cwd?: string;
  credentialId?: string;
}

export interface SignRequest {
  payload: string;
  encoding?: "utf8" | "base64";
  credentialId?: string;
}

export interface SignOk {
  /** Base64url detached signature. */
  signature: string;
  algorithm: string;
  /** The published half. Not material — it travels in the clear by design. */
  publicKey: string;
  keyFingerprint: string | null;
  credentialId: string;
}

export interface DescribeCredentialOk {
  purpose: string;
  credentials: readonly CredentialSummary[];
}

export interface VaultToolUsage {
  purpose: string;
  /** Every call, granted or refused, since this toolset was constructed. */
  calls: number;
  denials: number;
  /** Calls inside the current rate-limit window. */
  inWindow: number;
  lastAt: string | null;
}
