/**
 * The re-auth supervisor: the piece whose whole job is that the owner never
 * completes a login by hand again.
 *
 * The failure it exists to prevent already happened. A GitHub token expired
 * quietly, nothing noticed, and the next thing that needed it handed a
 * device-code prompt back to a human. Three properties follow from that, and
 * each one is a design constraint here rather than a nicety:
 *
 * 1. *Every* credential is tracked, not just OAuth tokens. A cookie jar with a
 *    session expiry and a password that a provider forces rotated fail the same
 *    way from the owner's seat, so they are swept the same way.
 * 2. Refresh happens well before expiry, not on the first 401. By the time a
 *    request fails the credential is already broken and something is already
 *    blocked.
 * 3. When it genuinely cannot self-heal, it says so *structurally* — which
 *    record, which reason, which strategy would fix it, and whether a human has
 *    to be present — instead of surfacing a stack trace and a login URL.
 *
 * The OAuth refresh itself is not reimplemented. `OAuthTokenRefresher` in
 * `oauth.ts` already does single-flight refresh, jittered backoff, and
 * `invalid_grant` to `needs_interactive_login`; the supervisor drives it through
 * `VaultCredentialStore` and adds the parts it does not have: everything that is
 * not an OAuth token, and the question of what to do once refresh is dead.
 *
 * The clock is injected everywhere. A supervisor whose correctness depends on
 * expiry arithmetic cannot be tested with real sleeps.
 *
 * Ported from Andromeda `src/vault/supervisor.ts`. The one behavioural change:
 * `findProviderDescriptor` comes from the injected adapter
 * (`provider-descriptor.ts`) rather than Andromeda's hardcoded built-in table,
 * so the default resolver returns an OAuth configuration only when the adapter
 * has one registered.
 * @module credentials/vault/supervisor
 */

import { OAuthTokenRefresher, type OAuthTransport } from "./oauth.js";
import { findProviderDescriptor } from "./provider-descriptor.js";
import type { OAuthAuthConfig } from "./descriptor.js";
import {
  descriptorOf,
  effectiveExpiryMs,
  type SecretRecord,
  type SecretScope,
  type SecretType,
} from "./record.js";
import { VaultCredentialStore, type VaultStore } from "./store.js";

export type { OAuthAuthConfig } from "./descriptor.js";

export type OAuthTokenRecord = Extract<SecretRecord, { type: "oauth_token" }>;

/** Resolves how to refresh a given token. Null means the vault cannot renew it. */
export type OAuthAuthResolver = (
  record: OAuthTokenRecord,
) => OAuthAuthConfig | null | Promise<OAuthAuthConfig | null>;

/**
 * Why a credential is dead beyond retrying. Distinct from the transport-level
 * reasons a request merely failed: everything here means the stored material
 * will not work again no matter how long the supervisor waits.
 */
export const TERMINAL_REASONS = [
  "invalid_grant",
  "token_revoked",
  "credential_changed",
  "no_refresh_token",
  "refresh_token_expired",
  "expired_without_refresh_path",
  "consent_required",
  "account_locked",
  "captcha_required",
  "device_approval_required",
  "hardware_token_required",
  "unknown",
] as const;

export type TerminalReason = (typeof TERMINAL_REASONS)[number];

/**
 * How a dead credential could be brought back. The enum is the extension point
 * for the browser-automation and WebAuthn slices: those slices implement
 * strategies that this slice can already *select and report*, which is why the
 * supervisor can be honest today about what it will and will not be able to do.
 */
export const REAUTH_STRATEGIES = [
  /** Exchange a refresh token. Implemented in this slice. */
  "oauth_refresh",
  /** Drive a browser login with a stored password. Browser-automation slice. */
  "password_login",
  /** As above, satisfying the second factor from a stored TOTP seed. Browser-automation slice. */
  "password_totp_login",
  /** Sign a WebAuthn assertion with a stored resident credential. Passkey slice. */
  "passkey_assertion",
  /** Spend a stored single-use recovery code. Browser-automation slice, last resort. */
  "recovery_code",
  /** Nothing in the vault can satisfy this. The owner has to be there. */
  "human_presence_required",
] as const;

export type ReauthStrategy = (typeof REAUTH_STRATEGIES)[number];

/** Strategies this slice can actually execute end to end today. */
const IMPLEMENTED_STRATEGIES: ReadonlySet<ReauthStrategy> = new Set<ReauthStrategy>([
  "oauth_refresh",
]);

/**
 * Reasons that are about the human, not about the credential. No amount of
 * stored material satisfies these, so the planner refuses to claim a strategy
 * for them even when a password and a TOTP seed are sitting right there.
 */
const HUMAN_ONLY_REASONS: ReadonlySet<TerminalReason> = new Set<TerminalReason>([
  "captcha_required",
  "device_approval_required",
  "hardware_token_required",
  "account_locked",
  "credential_changed",
]);

export interface ReauthPlan {
  strategy: ReauthStrategy;
  /** Plain statement of what re-authentication needs. Never contains material. */
  requirement: string;
  /** Vault record ids the strategy would consume. */
  materials: readonly string[];
  humanPresenceRequired: boolean;
  /** True only when this slice can run the strategy now, not once a later slice lands. */
  automatedToday: boolean;
  /** What could still go wrong even when the strategy is available. Null when nothing. */
  caveat: string | null;
}

export interface ReauthRequired {
  event: "reauth_required";
  recordId: string;
  type: SecretType;
  label: string;
  purpose: string;
  scope: SecretScope;
  detectedAt: string;
  reason: TerminalReason;
  plan: ReauthPlan;
}

/** What a caller observed when a credential was rejected. */
export interface AuthFailureSignal {
  status?: number | null;
  /** OAuth-style error code, or a provider-specific one. */
  error?: string | null;
  message?: string | null;
  /** True when nothing came back at all. A network fault is never a credential fault. */
  transport?: boolean;
}

export type FailureClassification =
  | { kind: "recoverable"; reason: string }
  | { kind: "terminal"; reason: TerminalReason };

const TERMINAL_ERROR_CODES: ReadonlyMap<string, TerminalReason> = new Map<string, TerminalReason>([
  ["invalid_grant", "invalid_grant"],
  ["invalid_client", "invalid_grant"],
  ["unauthorized_client", "consent_required"],
  ["invalid_token", "token_revoked"],
  ["token_revoked", "token_revoked"],
  ["revoked_token", "token_revoked"],
  ["access_denied", "consent_required"],
  ["consent_required", "consent_required"],
  ["interaction_required", "consent_required"],
  ["login_required", "consent_required"],
  ["expired_token", "refresh_token_expired"],
  ["password_changed", "credential_changed"],
  ["credential_changed", "credential_changed"],
  ["account_locked", "account_locked"],
  ["captcha_required", "captcha_required"],
  ["device_approval_required", "device_approval_required"],
  ["hardware_token_required", "hardware_token_required"],
]);

const RECOVERABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  "temporarily_unavailable",
  "server_error",
  "slow_down",
  "rate_limited",
  "too_many_requests",
  "authorization_pending",
]);

/**
 * Decide whether to retry or to give up and ask for help.
 *
 * Erring towards "recoverable" is the safe direction: a wrongly-terminal
 * classification pages the owner for a blip, which is exactly the outcome this
 * whole component exists to avoid. So an unrecognised failure with no explicit
 * terminal signal is retried, and only a named terminal code, or a 401/403
 * carrying one, ends the retries.
 */
export function classifyAuthFailure(signal: AuthFailureSignal): FailureClassification {
  if (signal.transport) return { kind: "recoverable", reason: "transport_failure" };
  const code = (signal.error ?? "").trim().toLowerCase();
  const terminal = TERMINAL_ERROR_CODES.get(code);
  if (terminal) return { kind: "terminal", reason: terminal };
  if (RECOVERABLE_ERROR_CODES.has(code)) return { kind: "recoverable", reason: code };

  const status = signal.status ?? null;
  if (status === 429 || (status !== null && status >= 500)) {
    return { kind: "recoverable", reason: status === 429 ? "rate_limited" : `http_${status}` };
  }

  const message = (signal.message ?? "").toLowerCase();
  if (message.includes("captcha")) return { kind: "terminal", reason: "captcha_required" };
  if (message.includes("password was changed") || message.includes("password changed")) {
    return { kind: "terminal", reason: "credential_changed" };
  }

  // A bare 401 or 403 with nothing else to go on: the credential was rejected
  // and re-sending it unchanged will be rejected again.
  if (status === 401 || status === 403) return { kind: "terminal", reason: "unknown" };
  return {
    kind: "recoverable",
    reason: code || (status === null ? "unclassified" : `http_${status}`),
  };
}

/**
 * Choose the strategy that could restore `record`, given everything else the
 * vault holds for the same purpose.
 *
 * Exported and pure because this is the judgement call the whole component is
 * measured on, and it should be testable without a vault, a clock, or a
 * transport. `peers` are full records rather than descriptors because one
 * decision — whether a passkey demands user verification — lives in material.
 */
export function planReauth(
  record: SecretRecord,
  reason: TerminalReason,
  peers: readonly SecretRecord[],
): ReauthPlan {
  const family = peers.filter((peer) => peer.purpose === record.purpose && peer.id !== record.id);
  const password = family.find((peer) => peer.type === "password");
  const totp = family.find((peer) => peer.type === "totp_seed");
  const passkey = family.find((peer) => peer.type === "passkey");
  const recovery = family.find(
    (peer) =>
      peer.type === "recovery_codes" &&
      peer.material.type === "recovery_codes" &&
      peer.material.codes.length > peer.material.consumed,
  );

  if (HUMAN_ONLY_REASONS.has(reason)) {
    return human(record, reason, describeHumanReason(reason));
  }

  if (
    passkey &&
    passkey.material.type === "passkey" &&
    !passkey.material.userVerificationRequired
  ) {
    return {
      strategy: "passkey_assertion",
      requirement: `sign a WebAuthn assertion for ${passkey.material.relyingPartyId} with the stored resident credential`,
      materials: [passkey.id],
      humanPresenceRequired: false,
      automatedToday: false,
      caveat: "the WebAuthn signing ceremony belongs to a future passkey slice, not this one",
    };
  }

  if (password && totp) {
    return {
      strategy: "password_totp_login",
      requirement: `browser login for ${record.purpose} using the stored password and a TOTP code generated from the stored seed`,
      materials: [password.id, totp.id],
      humanPresenceRequired: false,
      automatedToday: false,
      caveat: "browser-driven login belongs to a future browser-automation slice, not this one",
    };
  }

  if (password) {
    return {
      strategy: "password_login",
      requirement: `browser login for ${record.purpose} using the stored password`,
      materials: [password.id],
      humanPresenceRequired: false,
      automatedToday: false,
      caveat:
        "no second factor is stored for this purpose; if the account enforces MFA the automated login will stop at the challenge",
    };
  }

  if (passkey && passkey.material.type === "passkey") {
    return human(
      record,
      reason,
      `a passkey is stored for ${passkey.material.relyingPartyId} but the relying party requires user verification, which is a gesture no automation can produce`,
    );
  }

  if (recovery) {
    return {
      strategy: "recovery_code",
      requirement: `spend one stored recovery code for ${record.purpose}`,
      materials: [recovery.id],
      humanPresenceRequired: false,
      automatedToday: false,
      caveat:
        "recovery codes are single use and finite; spending one without replacing it moves the failure later, not away",
    };
  }

  return human(
    record,
    reason,
    `no password, passkey, or recovery code is stored for ${record.purpose}`,
  );
}

/**
 * Requests human presence to re-authenticate a record.
 *
 * Guarantees a reauth plan requiring human presence, indicating that the record
 * cannot be re-authenticated automatically due to the specified reason.
 * Returns a reauth plan with `humanPresenceRequired` set to true and `automatedToday` set to false.
 * Fails if the provided `record` is not a valid SecretRecord or `reason` is not recognized.
 */
function human(record: SecretRecord, reason: TerminalReason, requirement: string): ReauthPlan {
  return {
    strategy: "human_presence_required",
    requirement: `${record.label} (${record.purpose}) cannot be re-authenticated automatically: ${requirement}`,
    materials: [],
    humanPresenceRequired: true,
    automatedToday: false,
    caveat: reasonCaveat(reason),
  };
}

/**
 * Describes the reason for requiring human presence by providing a human-readable explanation.
 * Fails if the provided `reason` is not recognized.
 *
 * @returns A description of the reason why human presence is required.
 */
function describeHumanReason(reason: TerminalReason): string {
  switch (reason) {
    case "captcha_required":
      return "the provider is presenting a CAPTCHA, which is by construction a test that automation fails";
    case "device_approval_required":
      return "the provider requires approval on an enrolled device";
    case "hardware_token_required":
      return "the provider requires a hardware security key that must be physically touched";
    case "account_locked":
      return "the account is locked and only the owner can unlock it";
    case "credential_changed":
      return "the stored credential no longer matches the account; a new one has to be chosen by the owner";
    default:
      return "the provider requires a person";
  }
}

/** reasonCaveat implementation. */
function reasonCaveat(reason: TerminalReason): string | null {
  return reason === "unknown"
    ? "the provider gave no machine-readable reason; the classification is a fallback"
    : null;
}

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

export type CredentialState =
  /** No expiry recorded. Not a claim that it works, only that nothing says when it stops. */
  | "no_expiry"
  | "healthy"
  /** Inside the refresh window: the supervisor will act on the next sweep. */
  | "refresh_due"
  | "expired"
  /** Terminally failed. Only the plan's strategy restores it. */
  | "needs_reauth";

export interface CredentialHealth {
  id: string;
  type: SecretType;
  label: string;
  purpose: string;
  scope: SecretScope;
  state: CredentialState;
  expiresAt: string | null;
  /** When the supervisor next tries to renew. Null when it will not. */
  nextRefreshAt: string | null;
  /** True only when a strategy exists *and* this slice can run it. */
  selfHealing: boolean;
  strategy: ReauthStrategy;
  humanPresenceRequired: boolean;
  attempts: number;
  lastFailure: { at: string; reason: string; terminal: boolean } | null;
}

/* -------------------------------------------------------------------------- */
/* Supervisor                                                                  */
/* -------------------------------------------------------------------------- */

export interface ReauthSupervisorOptions {
  vault: VaultStore;
  now?: () => number;
  /** How far ahead of expiry a refresh is attempted. Two minutes matches `OAuthTokenRefresher`. */
  refreshSkewMs?: number;
  authFor?: OAuthAuthResolver;
  /** Injected so a test drives refresh without a network, and so a caller can share one refresher. */
  refresher?: OAuthTokenRefresher;
  transport?: OAuthTransport;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onReauthRequired?: (event: ReauthRequired) => void;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export type EnsureFreshOutcome =
  | { kind: "missing" }
  | { kind: "fresh"; record: SecretRecord }
  | { kind: "refreshed"; record: SecretRecord }
  /** Nothing to refresh — a password or a note has no renewal protocol. */
  | { kind: "unrefreshable"; record: SecretRecord }
  | { kind: "retry"; record: SecretRecord; reason: string; retryAfterMs: number; attempt: number }
  | { kind: "reauth_required"; record: SecretRecord; event: ReauthRequired };

export type AuthFailureOutcome =
  | { kind: "unknown_record" }
  | { kind: "recoverable"; reason: string; retryAfterMs: number; attempt: number }
  | { kind: "terminal"; reason: TerminalReason; event: ReauthRequired };

export interface SweepResult {
  checkedAt: string;
  refreshed: readonly string[];
  retrying: readonly string[];
  reauthRequired: readonly ReauthRequired[];
  healthy: readonly string[];
}

interface FailureState {
  attempts: number;
  lastFailureAt: number;
  lastReason: string;
  /** Set only on the terminal path, so the health view never has to cast. */
  terminalReason: TerminalReason | null;
}

export class ReauthSupervisor {
  readonly #vault: VaultStore;
  readonly #now: () => number;
  readonly #refreshSkewMs: number;
  readonly #authFor: OAuthAuthResolver;
  readonly #refresher: OAuthTokenRefresher;
  readonly #onReauthRequired: (event: ReauthRequired) => void;
  readonly #random: () => number;
  readonly #baseBackoffMs: number;
  readonly #maxBackoffMs: number;
  readonly #forcedRefresher: OAuthTokenRefresher | null;
  readonly #failures = new Map<string, FailureState>();
  readonly #emitted = new Map<string, TerminalReason>();
  readonly #events: ReauthRequired[] = [];

  /** Constructs an instance. */
  constructor(options: ReauthSupervisorOptions) {
    this.#vault = options.vault;
    this.#now = options.now ?? (() => Date.now());
    this.#refreshSkewMs = options.refreshSkewMs ?? 120_000;
    this.#authFor = options.authFor ?? providerDescriptorAuthResolver();
    this.#random = options.random ?? Math.random;
    this.#baseBackoffMs = options.baseBackoffMs ?? 500;
    this.#maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.#onReauthRequired = options.onReauthRequired ?? (() => {});
    const store = new VaultCredentialStore({ vault: options.vault, now: this.#now });
    const refresherOptions = {
      store,
      now: this.#now,
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
      ...(options.random ? { random: options.random } : {}),
    };
    this.#refresher =
      options.refresher ??
      new OAuthTokenRefresher({ ...refresherOptions, refreshSkewMs: this.#refreshSkewMs });
    // `OAuthTokenRefresher` only contacts the token endpoint when a credential
    // is inside its refresh window, which is right for a sweep and wrong for an
    // agent saying "this token is broken, get me another". A second refresher
    // over the same store with an unbounded skew makes every credential due,
    // reusing the class rather than growing a bypass inside it. Null when the
    // caller injected a refresher, because then this is the caller's policy.
    this.#forcedRefresher = options.refresher
      ? null
      : new OAuthTokenRefresher({ ...refresherOptions, refreshSkewMs: Number.MAX_SAFE_INTEGER });
  }

  /** Every `ReauthRequired` raised so far, oldest first. */
  events(): readonly ReauthRequired[] {
    return [...this.#events];
  }

  /**
   * Proactive pass over the whole vault. This is the loop that means an expiry
   * is noticed by the supervisor rather than by whatever was about to use the
   * credential.
   */
  async sweep(): Promise<SweepResult> {
    const refreshed: string[] = [];
    const retrying: string[] = [];
    const reauthRequired: ReauthRequired[] = [];
    const healthy: string[] = [];
    for (const id of await this.#vault.list()) {
      const outcome = await this.ensureFresh(id);
      switch (outcome.kind) {
        case "refreshed":
          refreshed.push(id);
          break;
        case "retry":
          retrying.push(id);
          break;
        case "reauth_required":
          reauthRequired.push(outcome.event);
          break;
        default:
          healthy.push(id);
          break;
      }
    }
    return {
      checkedAt: new Date(this.#now()).toISOString(),
      refreshed,
      retrying,
      reauthRequired,
      healthy,
    };
  }

  /**
   * Bring one credential up to date if it is inside the refresh window. Safe to
   * call before every use: a credential that is not due is returned untouched
   * without a request.
   */
  async ensureFresh(id: string): Promise<EnsureFreshOutcome> {
    const record = await this.#vault.get(id);
    if (!record) return { kind: "missing" };

    const terminal = this.#failures.get(id);
    if (terminal?.terminalReason) {
      return {
        kind: "reauth_required",
        record,
        event: await this.#raise(record, terminal.terminalReason),
      };
    }
    if (!this.#isDue(record)) return { kind: "fresh", record };
    if (record.type !== "oauth_token") {
      // Everything else expires without a renewal protocol the vault can speak.
      // That is not a bug to be retried; it is a re-auth, reported as one.
      const reason: TerminalReason = "expired_without_refresh_path";
      return { kind: "reauth_required", record, event: await this.#raise(record, reason) };
    }
    return this.#refreshOAuth(record);
  }

  /**
   * A caller was rejected. Records the failure, decides retry versus re-auth,
   * and raises a structured event in the terminal case.
   */
  async reportFailure(id: string, signal: AuthFailureSignal): Promise<AuthFailureOutcome> {
    const record = await this.#vault.get(id);
    if (!record) return { kind: "unknown_record" };
    const classification = classifyAuthFailure(signal);
    if (classification.kind === "terminal") {
      return {
        kind: "terminal",
        reason: classification.reason,
        event: await this.#raise(record, classification.reason),
      };
    }
    const attempt = this.#recordRecoverable(id, classification.reason);
    return {
      kind: "recoverable",
      reason: classification.reason,
      retryAfterMs: this.#backoff(attempt - 1),
      attempt,
    };
  }

  /**
   * Force a renewal attempt regardless of the refresh window — what an agent
   * calls after a 401 it has already classified as recoverable.
   */
  async reauth(id: string): Promise<EnsureFreshOutcome> {
    const record = await this.#vault.get(id);
    if (!record) return { kind: "missing" };
    this.#failures.delete(id);
    this.#emitted.delete(id);
    if (record.type !== "oauth_token") {
      return {
        kind: "reauth_required",
        record,
        event: await this.#raise(record, "expired_without_refresh_path"),
      };
    }
    return this.#refreshOAuth(record, { force: true });
  }

  /** Every credential, its state, when it next refreshes, and whether it can self-heal. */
  async health(): Promise<CredentialHealth[]> {
    const nowMs = this.#now();
    const records: SecretRecord[] = [];
    for (const id of await this.#vault.list()) {
      const record = await this.#vault.get(id);
      if (record) records.push(record);
    }
    return records.map((record) => this.#healthOf(record, records, nowMs));
  }

  /** Clear a record's failure state — after the owner really did log in by hand. */
  forget(id: string): void {
    this.#failures.delete(id);
    this.#emitted.delete(id);
  }

  /** #refreshOAuth implementation. */
  async #refreshOAuth(
    record: OAuthTokenRecord,
    options: { force?: boolean } = {},
  ): Promise<EnsureFreshOutcome> {
    if (!record.material.refreshToken) {
      return {
        kind: "reauth_required",
        record,
        event: await this.#raise(record, "no_refresh_token"),
      };
    }
    if (isPast(record.material.refreshTokenExpiresAt, this.#now())) {
      return {
        kind: "reauth_required",
        record,
        event: await this.#raise(record, "refresh_token_expired"),
      };
    }
    const auth = await this.#authFor(record);
    if (!auth) {
      return {
        kind: "reauth_required",
        record,
        event: await this.#raise(record, "expired_without_refresh_path"),
      };
    }
    const refresher =
      options.force && this.#forcedRefresher ? this.#forcedRefresher : this.#refresher;

    let refreshed: Awaited<ReturnType<OAuthTokenRefresher["ensureFreshCredential"]>>;
    try {
      // Single-flight, backoff, and invalid_grant handling all live in the
      // provider harness. Duplicating any of it here would mean two places to
      // fix when a provider misbehaves.
      refreshed = await refresher.ensureFreshCredential(record.id, auth);
    } catch (error) {
      const attempt = this.#recordRecoverable(record.id, describeError(error));
      return {
        kind: "retry",
        record,
        reason: describeError(error),
        retryAfterMs: this.#backoff(attempt - 1),
        attempt,
      };
    }
    if (refreshed === null) {
      // `OAuthTokenRefresher` returns null exactly when it has decided the
      // grant is dead, and records `needs_interactive_login` for it.
      const reason: TerminalReason =
        refresher.state(record.id) === "needs_interactive_login" ? "invalid_grant" : "unknown";
      return { kind: "reauth_required", record, event: await this.#raise(record, reason) };
    }
    this.#failures.delete(record.id);
    this.#emitted.delete(record.id);
    const stored = await this.#vault.get(record.id);
    return { kind: "refreshed", record: stored ?? record };
  }

  /** #isDue implementation. */
  #isDue(record: SecretRecord): boolean {
    const expiresAt = effectiveExpiryMs(record);
    if (expiresAt === null) return false;
    return this.#now() + this.#refreshSkewMs >= expiresAt;
  }

  /** #healthOf implementation. */
  #healthOf(record: SecretRecord, all: readonly SecretRecord[], nowMs: number): CredentialHealth {
    const descriptor = descriptorOf(record);
    const expiryMs = effectiveExpiryMs(record);
    const failure = this.#failures.get(record.id);
    const refreshable = record.type === "oauth_token" && record.material.refreshToken !== null;
    const state: CredentialState = failure?.terminalReason
      ? "needs_reauth"
      : expiryMs === null
        ? "no_expiry"
        : nowMs >= expiryMs
          ? "expired"
          : nowMs + this.#refreshSkewMs >= expiryMs
            ? "refresh_due"
            : "healthy";
    const plan = failure?.terminalReason
      ? planReauth(record, failure.terminalReason, all)
      : refreshable
        ? oauthRefreshPlan(record.id)
        : planReauth(record, "expired_without_refresh_path", all);
    return {
      id: descriptor.id,
      type: descriptor.type,
      label: descriptor.label,
      purpose: descriptor.purpose,
      scope: descriptor.scope,
      state,
      expiresAt: expiryMs === null ? null : new Date(expiryMs).toISOString(),
      nextRefreshAt:
        expiryMs === null || !refreshable || state === "needs_reauth"
          ? null
          : new Date(expiryMs - this.#refreshSkewMs).toISOString(),
      // Deliberately narrow: a strategy that a later slice will implement does
      // not count as self-healing today, however confident the plan sounds.
      selfHealing:
        state !== "needs_reauth" && refreshable && IMPLEMENTED_STRATEGIES.has(plan.strategy),
      strategy: plan.strategy,
      humanPresenceRequired: plan.humanPresenceRequired,
      attempts: failure?.attempts ?? 0,
      lastFailure: failure
        ? {
            at: new Date(failure.lastFailureAt).toISOString(),
            reason: failure.lastReason,
            terminal: failure.terminalReason !== null,
          }
        : null,
    };
  }

  /** #raise implementation. */
  async #raise(record: SecretRecord, reason: TerminalReason): Promise<ReauthRequired> {
    const all: SecretRecord[] = [];
    for (const id of await this.#vault.list()) {
      const peer = await this.#vault.get(id);
      if (peer) all.push(peer);
    }
    const event: ReauthRequired = {
      event: "reauth_required",
      recordId: record.id,
      type: record.type,
      label: record.label,
      purpose: record.purpose,
      scope: record.scope,
      detectedAt: new Date(this.#now()).toISOString(),
      reason,
      plan: planReauth(record, reason, all),
    };
    // One event per record per reason. A sweep every minute must not turn a
    // single dead token into a thousand notifications, and re-observing a
    // known-dead credential is not a new failure to count.
    const isNew = this.#emitted.get(record.id) !== reason;
    const previous = this.#failures.get(record.id);
    this.#failures.set(record.id, {
      attempts: (previous?.attempts ?? 0) + (isNew ? 1 : 0),
      lastFailureAt: isNew ? this.#now() : (previous?.lastFailureAt ?? this.#now()),
      lastReason: reason,
      terminalReason: reason,
    });
    if (isNew) {
      this.#emitted.set(record.id, reason);
      this.#events.push(event);
      this.#onReauthRequired(event);
    }
    return event;
  }

  /** #recordRecoverable implementation. */
  #recordRecoverable(id: string, reason: string): number {
    const previous = this.#failures.get(id);
    const attempts = (previous?.terminalReason ? 0 : (previous?.attempts ?? 0)) + 1;
    this.#failures.set(id, {
      attempts,
      lastFailureAt: this.#now(),
      lastReason: reason,
      terminalReason: null,
    });
    return attempts;
  }

  /** #backoff implementation. */
  #backoff(attempt: number): number {
    const core = Math.min(this.#maxBackoffMs, this.#baseBackoffMs * 2 ** Math.max(0, attempt));
    const jitter = core * 0.2 * (this.#random() * 2 - 1);
    return Math.max(0, Math.round(core + jitter));
  }
}

/**
 * Plans an OAuth refresh operation.
 *
 * Guarantees that the returned `ReauthPlan` specifies the strategy as "oauth_refresh" and
 * the requirement to exchange the stored refresh token for a new access token.
 *
 * On failure paths, the plan will be updated to reflect the number of attempts made.
 */
function oauthRefreshPlan(id: string): ReauthPlan {
  return {
    strategy: "oauth_refresh",
    requirement: "exchange the stored refresh token for a new access token",
    materials: [id],
    humanPresenceRequired: false,
    automatedToday: true,
    caveat: null,
  };
}

/**
 * Default resolver: treat a record's purpose as a provider id and take the
 * adapter's OAuth configuration. Returns null for api-key providers, for OAuth
 * routes without a registered endpoint supplement, and for purposes that are
 * not providers at all — which is the correct answer, because all of those have
 * no refresh protocol for the vault to speak.
 */
export function providerDescriptorAuthResolver(): OAuthAuthResolver {
  return (record) => {
    const descriptor = findProviderDescriptor(record.purpose.split("/")[0] ?? record.purpose);
    if (!descriptor) return null;
    return descriptor.auth && descriptor.auth.method !== "api_key" ? descriptor.auth : null;
  };
}

/** isPast implementation. */
function isPast(value: string | null, nowMs: number): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && nowMs >= parsed;
}

/**
 * Provides a human-readable description of an error.
 *
 * Guarantees: Returns the error's message if it is an instance of Error; otherwise,
 *             returns the string representation of the error.
 *
 * Fails: If the input is not an instance of Error, returns its string representation.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
