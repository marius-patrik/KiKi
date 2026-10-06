/**
 * The privileged, in-process custody API. **Not the agent surface.**
 *
 * This module used to be called the surface an agent is allowed to touch, and
 * that was the bug. `secret()` hands back a `SecretRecord` with live material
 * in it, and an LLM-driven agent that holds material has already leaked it: it
 * goes into the next prompt, the transcript, a log line, a tool argument, or the
 * body of a request to somebody else's server. The owner's instruction —
 * *agents should never leave, there should be a tool to use them* — is
 * implemented in `tools.ts`, and `VaultToolset` is what an agent gets now.
 *
 * What is left here is custody for callers that are not agents: code inside the
 * trust boundary that must construct something *from* material and then hold it
 * privately. A signer whose closure is the only thing that ever saw the PEM is
 * the canonical example; the vault CLI, which the owner drives, is the other.
 * Nothing in this file may be passed to a model.
 *
 * `custody: "sealed"` is the enforcement lever for that last sentence: a sealed
 * custodian answers every material request with `VaultMaterialSealedError`, so a
 * runtime that must hand a custodian across a boundary it does not fully trust
 * hands a sealed one and the retrieval path is dead on arrival.
 *
 * Three properties survive from the original design and must keep surviving.
 *
 * *Deny by default.* `scopeAllows` requires an explicit match on both axes. A
 * record whose scope was never filled in is readable by nobody, so a mistake in
 * provisioning shows up as an agent that cannot work rather than as a secret
 * that everybody can read.
 *
 * *A denial and a miss look the same to the caller.* Both raise
 * `VaultAccessError` with the same message, so a caller cannot map the vault by
 * probing ids. The audit log, which the caller never sees, records which it
 * actually was — that distinction matters to the owner and to nobody else.
 *
 * *One audit trail.* `AuditEntry` covers both this API and the capability tools,
 * because an owner asking "what happened to my GitHub token" wants one answer,
 * not two logs to join by hand.
 *
 * Ported from Andromeda `src/vault/agent.ts`; the audit actions reserved for
 * the capability tools land with `tools.ts`.
 */

import {
  descriptorOf,
  scopeAllows,
  type AgentIdentity,
  type SecretDescriptor,
  type SecretRecord,
  type SecretType,
} from "./record.js";
import { generateTotp, type TotpCode } from "./totp.js";
import type { VaultStore } from "./store.js";
import type {
  AuthFailureOutcome,
  AuthFailureSignal,
  CredentialHealth,
  EnsureFreshOutcome,
  ReauthSupervisor,
} from "./supervisor.js";

export type AuditAction =
  /* Privileged custody. */
  | "read"
  | "read_denied"
  | "read_missing"
  /** Material was asked for through a sealed custodian and refused outright. */
  | "read_sealed"
  | "totp_generated"
  | "failure_reported"
  | "reauth_requested"
  | "health_read"
  /* Capability tools. The action names the operation; `outcome` says how it went. */
  | "tool_fetch"
  | "tool_totp"
  | "tool_process"
  | "tool_sign"
  | "tool_describe";

export interface AuditEntry {
  at: string;
  actor: AgentIdentity;
  action: AuditAction;
  recordId: string | null;
  purpose: string | null;
  /** The record's stable audit correlation id, so history survives rotation. */
  auditRef: string | null;
  /** `granted: ...` or `denied: <reason> (...)`. Never material. */
  outcome: string;
  /**
   * Host the credential was presented to. Null for operations with no network
   * target. Present so "which credential went where" is answerable from the
   * trail alone, which is the question an exfiltration attempt shows up in.
   */
  targetHost?: string | null;
  /** Ordinal of this call for this actor and purpose, so a runaway agent is visible. */
  use?: number;
}

/** Where audit entries go. Never carries material, so any sink is safe. */
export interface AuditSink {
  record(entry: AuditEntry): void | Promise<void>;
}

/** In-process audit sink. Real deployments point this at the event log. */
export class MemoryAuditLog implements AuditSink {
  readonly #entries: AuditEntry[] = [];

  /** record implementation. */
  record(entry: AuditEntry): void {
    this.#entries.push(entry);
  }

  /** entries implementation. */
  entries(): readonly AuditEntry[] {
    return [...this.#entries];
  }
}

/**
 * Raised for both "no such record" and "not yours". Identical message in both
 * cases; `reason` is always `"denied"` for the same reason.
 */
export class VaultAccessError extends Error {
  readonly reason = "denied" as const;
  readonly recordId: string;

  /** Constructs an instance. */
  constructor(recordId: string, identity: AgentIdentity) {
    super(`vault record is not accessible to ${identity.workspace}/${identity.agent}: ${recordId}`);
    this.name = "VaultAccessError";
    this.recordId = recordId;
  }
}

/**
 * Whether this custodian may produce material at all.
 *
 * `"privileged"` is the historical behaviour and the only mode in which
 * `revealSecret` works. `"sealed"` is what a runtime constructs when a
 * custodian has to exist near an agent: same scope rules, same audit trail, and
 * no path to material whatsoever.
 */
export type VaultCustody = "privileged" | "sealed";

/** Raised when material is requested through a sealed custodian. */
export class VaultMaterialSealedError extends Error {
  readonly reason = "sealed" as const;
  readonly recordId: string;

  /** Constructs an instance. */
  constructor(recordId: string, identity: AgentIdentity) {
    super(
      `vault material is sealed for ${identity.workspace}/${identity.agent}: ${recordId}. ` +
        "Use a VaultToolset capability instead — secrets do not leave the vault.",
    );
    this.name = "VaultMaterialSealedError";
    this.recordId = recordId;
  }
}

export interface PrivilegedVaultCustodianOptions {
  vault: VaultStore;
  identity: AgentIdentity;
  /** Present when the caller is allowed to trigger renewals and read health. */
  supervisor?: ReauthSupervisor;
  audit?: AuditSink;
  now?: () => number;
  /** Defaults to `"privileged"`. Anything near an agent should be `"sealed"`. */
  custody?: VaultCustody;
}

export class PrivilegedVaultCustodian {
  readonly #vault: VaultStore;
  readonly #identity: AgentIdentity;
  readonly #supervisor: ReauthSupervisor | null;
  readonly #audit: AuditSink | null;
  readonly #now: () => number;
  readonly #custody: VaultCustody;

  /** Constructs an instance. */
  constructor(options: PrivilegedVaultCustodianOptions) {
    this.#vault = options.vault;
    this.#identity = { workspace: options.identity.workspace, agent: options.identity.agent };
    this.#supervisor = options.supervisor ?? null;
    this.#audit = options.audit ?? null;
    this.#now = options.now ?? (() => Date.now());
    this.#custody = options.custody ?? "privileged";
  }

  /**
   * Returns the same custodian with material access permanently removed, ensuring
   * it is sealed. This operation is cheap, so an unsealed custodian should never
   * be passed across a boundary.
   *
   * @returns A new `PrivilegedVaultCustodian` instance with custody set to "sealed".
   * If already sealed, returns the current instance.
   */
  get identity(): AgentIdentity {
    return { ...this.#identity };
  }

  /** `"sealed"` means `revealSecret` is dead on this instance. */
  get custody(): VaultCustody {
    return this.#custody;
  }

  /**
   * The same custodian with material access permanently removed. Cheap, so
   * there is no excuse for handing an unsealed one across a boundary.
   */
  seal(): PrivilegedVaultCustodian {
    if (this.#custody === "sealed") return this;
    return new PrivilegedVaultCustodian({
      vault: this.#vault,
      identity: this.#identity,
      ...(this.#supervisor ? { supervisor: this.#supervisor } : {}),
      ...(this.#audit ? { audit: this.#audit } : {}),
      now: this.#now,
      custody: "sealed",
    });
  }

  /**
   * Fetch a record *with its material* by id. Raises when it does not exist, is
   * out of scope, or this custodian is sealed.
   *
   * **Privileged.** Every call site is a place a secret enters ordinary memory,
   * and the result must never reach a model, a log, or a tool argument. If the
   * caller only needs to *use* the credential, the answer is a `VaultToolset`
   * capability, not this.
   */
  async revealSecret(id: string): Promise<SecretRecord> {
    if (this.#custody === "sealed") {
      await this.#log("read_sealed", null, id, "denied: material is sealed on this custodian");
      throw new VaultMaterialSealedError(id, this.#identity);
    }
    return this.#authorized(id);
  }

  /**
   * Fetch by what the secret is *for* rather than by id. Privileged, for the
   * same reason `revealSecret` is: the material comes with it.
   */
  async secretForPurpose(purpose: string, type: SecretType): Promise<SecretRecord | null> {
    for (const descriptor of await this.#accessibleDescriptors()) {
      if (descriptor.purpose !== purpose || descriptor.type !== type) continue;
      return this.revealSecret(descriptor.id);
    }
    return null;
  }

  /** Every record this caller may read, material stripped. */
  async listAccessible(): Promise<SecretDescriptor[]> {
    return this.#accessibleDescriptors();
  }

  /**
   * A live TOTP code from a stored seed. Works on a sealed custodian: a code is
   * an outcome, not material, which is the whole distinction `tools.ts` is built
   * on. `VaultToolset.currentTotpCode` is the agent-facing form of this.
   */
  async totpCode(id: string): Promise<TotpCode> {
    const record = await this.#authorized(id);
    if (record.type !== "totp_seed") {
      throw new Error(`vault record ${id} is a ${record.type}, not a totp_seed`);
    }
    const code = generateTotp(record.material.parameters, this.#now());
    // The code itself is never logged: it is a bearer credential for its window.
    await this.#log("totp_generated", record, id, `valid for ${Math.max(0, code.remainingMs)}ms`);
    return code;
  }

  /** As `totpCode`, addressed by purpose. */
  async totpCodeForPurpose(purpose: string): Promise<TotpCode | null> {
    const descriptor = (await this.#accessibleDescriptors()).find(
      (candidate) => candidate.purpose === purpose && candidate.type === "totp_seed",
    );
    return descriptor ? this.totpCode(descriptor.id) : null;
  }

  /** Report that a credential was rejected, and get back retry-or-reauth. */
  async reportAuthFailure(id: string, signal: AuthFailureSignal): Promise<AuthFailureOutcome> {
    const record = await this.#authorized(id);
    const supervisor = this.#requireSupervisor();
    const outcome = await supervisor.reportFailure(record.id, signal);
    await this.#log(
      "failure_reported",
      record,
      id,
      outcome.kind === "unknown_record" ? "unknown" : `${outcome.kind}: ${outcome.reason}`,
    );
    return outcome;
  }

  /** Ask for a credential to be renewed now. */
  async reauth(id: string): Promise<EnsureFreshOutcome> {
    const record = await this.#authorized(id);
    const supervisor = this.#requireSupervisor();
    const outcome = await supervisor.reauth(record.id);
    await this.#log("reauth_requested", record, id, outcome.kind);
    return outcome;
  }

  /** Health for the records this agent may read, and no others. */
  async health(): Promise<CredentialHealth[]> {
    const supervisor = this.#requireSupervisor();
    const all = await supervisor.health();
    const permitted = new Set(
      (await this.#accessibleDescriptors()).map((descriptor) => descriptor.id),
    );
    await this.#log("health_read", null, null, `${permitted.size} records in scope`);
    return all.filter((entry) => permitted.has(entry.id));
  }

  /**
   * Load a record and check the caller may act with it, logging either way.
   *
   * The material comes back because operations that need only the identity —
   * TOTP, re-auth, failure reporting — still have to read the record to know
   * whose it is. What matters is that they hand back an outcome and let the
   * record fall out of scope, rather than returning it the way `revealSecret`
   * does. That is why they work on a sealed custodian and `revealSecret` does not.
   */
  async #authorized(id: string): Promise<SecretRecord> {
    const record = await this.#vault.get(id);
    if (!record) {
      await this.#log("read_missing", null, id, "no such record");
      throw new VaultAccessError(id, this.#identity);
    }
    if (!scopeAllows(record.scope, this.#identity)) {
      await this.#log(
        "read_denied",
        record,
        id,
        `scope ${record.scope.workspace}/[${record.scope.agents.join(",")}]`,
      );
      throw new VaultAccessError(id, this.#identity);
    }
    await this.#log("read", record, id, "granted");
    return record;
  }

  /** #accessibleDescriptors implementation. */
  async #accessibleDescriptors(): Promise<SecretDescriptor[]> {
    const descriptors: SecretDescriptor[] = [];
    for (const id of await this.#vault.list()) {
      const record = await this.#vault.get(id);
      if (record && scopeAllows(record.scope, this.#identity))
        descriptors.push(descriptorOf(record));
    }
    return descriptors;
  }

  /** #requireSupervisor implementation. */
  #requireSupervisor(): ReauthSupervisor {
    if (!this.#supervisor) throw new Error("this vault agent was not given a re-auth supervisor");
    return this.#supervisor;
  }

  /** #log implementation. */
  async #log(
    action: AuditAction,
    record: SecretRecord | null,
    id: string | null,
    // jscpd:ignore-start -- mirrors a matching block in vault/tools/toolset.ts's tool-outcome handling for a different call site
    outcome: string,
  ): Promise<void> {
    if (!this.#audit) return;
    await this.#audit.record({
      at: new Date(this.#now()).toISOString(),
      actor: { ...this.#identity },
      action,
      // jscpd:ignore-end
      recordId: id,
      purpose: record ? record.purpose : null,
      auditRef: record ? record.auditRef : null,
      outcome,
      targetHost: null,
    });
  }
}
