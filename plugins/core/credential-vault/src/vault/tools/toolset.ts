import { createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import { findProviderDescriptor } from "../provider-descriptor.js";
import type { AuditSink } from "../agent.js";
import {
  descriptorOf,
  scopeAllows,
  type AgentIdentity,
  type SecretRecord,
  type SecretType,
} from "../record.js";
import type { VaultStore } from "../store.js";
import type { ReauthSupervisor } from "../supervisor.js";
import { generateTotp } from "../totp.js";
import type { MaterialFree } from "./material-free.js";
import type {
  VaultDenialReason,
  VaultToolDenial,
  VaultToolOperation,
  VaultToolResult,
} from "./tool-outcomes.js";
import type { VaultTransport, VaultTransportResponse } from "./transport.js";
import type { ProcessOutcome, ProcessRunner } from "./process-runner.js";
import type {
  AuthenticatedFetchOk,
  AuthenticatedFetchRequest,
  AuthenticatedProcessOk,
  AuthenticatedProcessRequest,
  CredentialHealthSummary,
  CredentialSummary,
  DescribeCredentialOk,
  GitRequest,
  SignOk,
  SignRequest,
  TotpCodeOk,
  VaultToolUsage,
} from "./requests.js";
import { allowedHostsFor, hostAllowed, providerIdForPurpose } from "./host-allowlist.js";
import { authPlacementFor } from "./auth-placement.js";
import { redact, redactionTokens } from "./redaction.js";
import {
  accountOf,
  applyAuth,
  auditActionFor,
  credentialSecret,
  privateKeyInput,
} from "./credential-secret.js";

/** Environment variable the git credential helper reads the secret out of. */
const GIT_SECRET_ENV = "ANDROMEDA_VAULT_SECRET";
const GIT_USER_ENV = "ANDROMEDA_VAULT_USER";

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
const EXEC_TAG = "exec:";

const METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOOPBACK: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Headers an agent may never set. Every one of them is a channel for presenting
 * a credential the vault did not choose, and `set-cookie` is on the response
 * side of the same problem.
 */
const FORBIDDEN_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "authentication",
  "cookie",
  "cookie2",
  "x-api-key",
  "api-key",
  "apikey",
  "x-goog-api-key",
  "x-amz-security-token",
  "x-auth-token",
  "x-access-token",
  "x-vault-token",
  "private-token",
  "x-csrf-token",
]);

/** Response headers that would hand the agent a *new* credential. */
const STRIPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set(["set-cookie", "set-cookie2"]);

const FORBIDDEN_QUERY_PARAMETERS: ReadonlySet<string> = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth_token",
]);

export interface VaultToolLimits {
  /** Calls per purpose inside `windowMs` before refusal. */
  maxCallsPerWindow?: number;
  windowMs?: number;
}

export interface VaultToolsetOptions {
  vault: VaultStore;
  identity: AgentIdentity;
  audit?: AuditSink;
  /** Present when `describeCredential` should report health. */
  supervisor?: ReauthSupervisor;
  transport?: VaultTransport;
  /** Absent means `runAuthenticatedProcess` and the git helpers are unavailable. */
  runProcess?: ProcessRunner;
  now?: () => number;
  limits?: VaultToolLimits;
}

interface UsageState {
  calls: number;
  denials: number;
  window: number[];
  lastAt: number | null;
}

/**
 * The object handed to an agent.
 *
 * It holds a `VaultStore` rather than a `PrivilegedVaultCustodian` on purpose:
 * nothing here is built on the retrieval API, so the day that API is deleted
 * outright this module does not change. Scope checking, auditing and rate
 * limiting are done here because `VaultStore` has no idea who is calling, and
 * one place to make an authorization decision is the only number that works.
 */
export class VaultToolset {
  readonly #vault: VaultStore;
  readonly #identity: AgentIdentity;
  readonly #audit: AuditSink | null;
  readonly #supervisor: ReauthSupervisor | null;
  readonly #transport: VaultTransport | null;
  readonly #runProcess: ProcessRunner | null;
  readonly #now: () => number;
  readonly #maxCallsPerWindow: number;
  readonly #windowMs: number;
  readonly #usage = new Map<string, UsageState>();

  /** Constructs an instance. */
  constructor(options: VaultToolsetOptions) {
    this.#vault = options.vault;
    this.#identity = { workspace: options.identity.workspace, agent: options.identity.agent };
    this.#audit = options.audit ?? null;
    this.#supervisor = options.supervisor ?? null;
    this.#transport = options.transport ?? null;
    this.#runProcess = options.runProcess ?? null;
    this.#now = options.now ?? (() => Date.now());
    this.#maxCallsPerWindow = options.limits?.maxCallsPerWindow ?? 60;
    this.#windowMs = options.limits?.windowMs ?? 60_000;
  }

  /** identity implementation. */
  get identity(): AgentIdentity {
    return { ...this.#identity };
  }

  /** Per-purpose call counts, so a runaway agent is visible to the owner. */
  usage(): MaterialFree<readonly VaultToolUsage[]> {
    return [...this.#usage.entries()].map(([purpose, state]) => ({
      purpose,
      calls: state.calls,
      denials: state.denials,
      inWindow: state.window.filter((at) => at > this.#now() - this.#windowMs).length,
      lastAt: state.lastAt === null ? null : new Date(state.lastAt).toISOString(),
    }));
  }

  /* ---------------------------------------------------------------------- */

  /**
   * Perform an authenticated HTTP request. The agent chooses the method, URL,
   * headers and body; the vault chooses the credential, where it goes, and
   * whether the destination is allowed to see it.
   */
  async authenticatedFetch(
    purpose: string,
    request: AuthenticatedFetchRequest,
  ): Promise<MaterialFree<VaultToolResult<AuthenticatedFetchOk>>> {
    const gate = await this.#begin("authenticated_fetch", purpose);
    if (!gate.ok) return gate.denial;

    if (!this.#transport) {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        null,
        null,
        "capability_unavailable",
        "no transport is configured for this agent",
      );
    }

    const found = await this.#credentialFor(purpose, request.credentialId, [
      "oauth_token",
      "api_key",
      "cookie_jar",
      "password",
    ]);
    if (!found.ok) return this.#denyFound("authenticated_fetch", purpose, null, found);
    const record = found.record;

    const placement = authPlacementFor(record);
    if (!placement) {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        null,
        "auth_placement_unknown",
        `the vault does not know how ${record.type} material for ${purpose} is presented; tag the record with auth:bearer, auth:header:<name>, auth:query:<name>, or auth:basic`,
      );
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        null,
        "malformed_url",
        "the request url is not a url",
      );
    }
    if (url.username || url.password) {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        url.hostname,
        "url_credentials",
        "the request url carries userinfo credentials",
      );
    }
    const insecure =
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && LOOPBACK.has(url.hostname.toLowerCase()));
    if (insecure) {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        url.hostname,
        "insecure_scheme",
        `credentials are only presented over https, not ${url.protocol.replace(":", "")}`,
      );
    }

    const hostDenial = await this.#checkHostAllowed(
      "authenticated_fetch",
      purpose,
      record,
      url.hostname,
    );
    if (hostDenial) return hostDenial;

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      const lower = name.trim().toLowerCase();
      if (
        FORBIDDEN_REQUEST_HEADERS.has(lower) ||
        (placement.kind === "header" && lower === placement.header.toLowerCase())
      ) {
        return this.#deny(
          "authenticated_fetch",
          purpose,
          record,
          url.hostname,
          "agent_supplied_auth",
          `an agent may not set the ${lower} header; the vault attaches authentication itself`,
        );
      }
      if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name.trim())) {
        return this.#deny(
          "authenticated_fetch",
          purpose,
          record,
          url.hostname,
          "invalid_argument",
          `malformed header name: ${name.trim()}`,
        );
      }
      headers[name.trim()] = value;
    }
    for (const parameter of url.searchParams.keys()) {
      const lower = parameter.toLowerCase();
      if (
        FORBIDDEN_QUERY_PARAMETERS.has(lower) ||
        (placement.kind === "query" && lower === placement.parameter.toLowerCase())
      ) {
        return this.#deny(
          "authenticated_fetch",
          purpose,
          record,
          url.hostname,
          "agent_supplied_auth",
          `an agent may not set the ${lower} query parameter; the vault attaches authentication itself`,
        );
      }
    }

    const method = (request.method ?? "GET").trim().toUpperCase();
    if (!METHODS.has(method)) {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        url.hostname,
        "method_not_allowed",
        `unsupported method: ${method}`,
      );
    }
    const body = request.body ?? null;
    if (body !== null && !BODY_METHODS.has(method)) {
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        url.hostname,
        "body_not_allowed",
        `${method} does not carry a body`,
      );
    }

    applyAuth(placement, record, url, headers);

    const tokens = redactionTokens(record);
    let response: VaultTransportResponse;
    try {
      response = await this.#transport({ method, url: url.toString(), headers, body });
    } catch (error) {
      // The thrown value may have been built from the request, headers and all.
      return this.#deny(
        "authenticated_fetch",
        purpose,
        record,
        url.hostname,
        "transport_failure",
        redact(error instanceof Error ? error.message : String(error), tokens),
      );
    }

    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
      responseHeaders[name] = redact(value, tokens);
    }
    const location = response.headers
      ? (Object.entries(response.headers).find(
          ([name]) => name.toLowerCase() === "location",
        )?.[1] ?? null)
      : null;
    const redirected = response.status >= 300 && response.status < 400 ? location : null;

    await this.#log(
      "authenticated_fetch",
      record,
      url.hostname,
      `granted: http ${response.status}`,
      purpose,
    );
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText ?? "",
      headers: responseHeaders,
      body: redact(response.body ?? "", tokens),
      host: url.hostname.toLowerCase(),
      redirectedTo: redirected === null ? null : redact(redirected, tokens),
      credential: await this.#summarize(record),
    };
  }

  /* ---------------------------------------------------------------------- */

  /**
   * A live TOTP code. This is the whole argument for capability tools in one
   * call: the agent gets something that authenticates once and expires in
   * seconds, instead of a seed that authenticates forever.
   */
  async currentTotpCode(
    purpose: string,
    credentialId?: string,
  ): Promise<MaterialFree<VaultToolResult<TotpCodeOk>>> {
    const gate = await this.#begin("totp_code", purpose);
    if (!gate.ok) return gate.denial;

    const found = await this.#credentialFor(purpose, credentialId, ["totp_seed"]);
    if (!found.ok) return this.#denyFound("totp_code", purpose, null, found);
    const record = found.record;
    if (record.material.type !== "totp_seed") {
      return this.#deny(
        "totp_code",
        purpose,
        record,
        null,
        "wrong_credential_type",
        `${record.id} is a ${record.type}`,
      );
    }

    const nowMs = this.#now();
    const generated = generateTotp(record.material.parameters, nowMs);
    // The code is a bearer credential for its window, so it is not logged either.
    await this.#log(
      "totp_code",
      record,
      null,
      `granted: valid for ${Math.max(0, generated.remainingMs)}ms`,
      purpose,
    );
    return {
      ok: true,
      code: generated.code,
      digits: record.material.parameters.digits,
      validUntil: new Date(generated.validUntilMs).toISOString(),
      remainingMs: generated.remainingMs,
      credentialId: record.id,
      purpose: record.purpose,
    };
  }

  /* ---------------------------------------------------------------------- */

  /**
   * Run a child process with the credential in its environment.
   *
   * The child's environment is *built*, not inherited: the parent's own
   * variables — which on an agent host include other people's tokens — do not
   * cross into a process the agent named. The environment is never returned,
   * never logged, and scrubbed out of anything the child printed.
   *
   * Arbitrary execution needs an explicit grant, so the record must carry an
   * `exec:<command>` tag. Scope alone is not enough authority to run code.
   */
  async runAuthenticatedProcess(
    purpose: string,
    // jscpd:ignore-start -- internal/cross-file near-duplicate tool-outcome and host-check blocks kept independent per call site
    request: AuthenticatedProcessRequest,
  ): Promise<MaterialFree<VaultToolResult<AuthenticatedProcessOk>>> {
    const gate = await this.#beginProcessOperation(purpose);
    if (!gate.ok) return gate.denial;

    const found = await this.#credentialFor(purpose, request.credentialId, [
      "api_key",
      "oauth_token",
      "password",
      // jscpd:ignore-end
      "generic_note",
    ]);
    if (!found.ok) return this.#denyFound("authenticated_process", purpose, null, found);
    const record = found.record;

    const command = request.command.trim();
    if (!command) {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        null,
        "invalid_argument",
        "no command given",
      );
    }
    if (!record.tags.includes(`${EXEC_TAG}${command}`)) {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        null,
        "command_not_permitted",
        `${purpose} does not permit running ${command}; add an exec:${command} tag to the record`,
      );
    }

    const credentialEnv = (request.credentialEnv ?? GIT_SECRET_ENV).trim();
    if (!ENV_NAME.test(credentialEnv)) {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        null,
        "invalid_argument",
        `malformed environment variable name: ${credentialEnv}`,
      );
    }
    const secret = credentialSecret(record);
    if (!secret) {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        null,
        "wrong_credential_type",
        `${record.type} material cannot be injected into a process`,
      );
    }
    for (const name of Object.keys(request.env ?? {})) {
      if (name === credentialEnv) {
        return this.#deny(
          "authenticated_process",
          purpose,
          record,
          null,
          "agent_supplied_auth",
          `an agent may not set ${credentialEnv}; the vault fills it`,
        );
      }
    }

    return this.#spawn(
      "authenticated_process",
      purpose,
      record,
      {
        command,
        args: request.args ?? [],
        cwd: request.cwd ?? null,
        env: { ...(request.env ?? {}), [credentialEnv]: secret.reveal() },
      },
      null,
    );
  }

  /** Push to an allow-listed https remote with the credential supplied by helper. */
  async gitPush(
    purpose: string,
    request: GitRequest,
  ): Promise<MaterialFree<VaultToolResult<AuthenticatedProcessOk>>> {
    return this.#git(purpose, "push", request);
  }

  /** Fetch from an allow-listed https remote with the credential supplied by helper. */
  async gitFetch(
    purpose: string,
    request: GitRequest,
  ): Promise<MaterialFree<VaultToolResult<AuthenticatedProcessOk>>> {
    return this.#git(purpose, "fetch", request);
  }

  /* ---------------------------------------------------------------------- */

  /** Sign a payload with a stored key. The signature comes back; the key does not. */
  async signWith(
    purpose: string,
    request: SignRequest,
  ): Promise<MaterialFree<VaultToolResult<SignOk>>> {
    const gate = await this.#begin("sign", purpose);
    if (!gate.ok) return gate.denial;

    const found = await this.#credentialFor(purpose, request.credentialId, ["ssh_key", "passkey"]);
    if (!found.ok) return this.#denyFound("sign", purpose, null, found);
    const record = found.record;

    if (typeof request.payload !== "string" || request.payload.length === 0) {
      return this.#deny("sign", purpose, record, null, "invalid_argument", "a payload is required");
    }
    const payload = Buffer.from(request.payload, request.encoding === "base64" ? "base64" : "utf8");
    if (payload.byteLength === 0) {
      return this.#deny(
        "sign",
        purpose,
        record,
        null,
        "invalid_argument",
        "the payload decoded to no bytes",
      );
    }

    let key: KeyObject;
    let published: string;
    let fingerprint: string | null;
    if (record.material.type === "ssh_key") {
      const passphrase = record.material.passphrase;
      try {
        key = createPrivateKey(
          passphrase
            ? { key: record.material.privateKey.reveal(), passphrase: passphrase.reveal() }
            : record.material.privateKey.reveal(),
        );
      } catch {
        // The thrown message can quote the key body, so it does not travel.
        return this.#deny(
          "sign",
          purpose,
          record,
          null,
          "invalid_argument",
          `the private key in ${record.id} cannot be loaded`,
        );
      }
      published = record.material.publicKey;
      fingerprint = record.material.fingerprint;
    } else if (record.material.type === "passkey") {
      if (record.material.userVerificationRequired) {
        return this.#deny(
          "sign",
          purpose,
          record,
          null,
          "human_presence_required",
          `${record.material.relyingPartyId} requires user verification, which is a gesture no automation produces`,
        );
      }
      try {
        key = createPrivateKey(privateKeyInput(record.material.privateKey.reveal()));
        // Derived from the private half rather than stored beside it, so the
        // two cannot disagree — the same rule `discovery/identity.ts` follows.
        const pem = key.export({ type: "pkcs8", format: "pem" }) as string;
        published = (
          createPublicKey(pem).export({ type: "spki", format: "der" }) as Buffer
        ).toString("base64");
      } catch {
        return this.#deny(
          "sign",
          purpose,
          record,
          null,
          "invalid_argument",
          `the private key in ${record.id} cannot be loaded`,
        );
      }
      fingerprint = record.material.credentialId;
    } else {
      return this.#deny(
        "sign",
        purpose,
        record,
        null,
        "wrong_credential_type",
        `${record.id} is a ${record.type}`,
      );
    }

    const algorithm = key.asymmetricKeyType ?? "unknown";
    let signature: Buffer;
    try {
      signature = cryptoSign(
        algorithm === "ed25519" || algorithm === "ed448" ? null : "sha256",
        payload,
        key,
      );
    } catch {
      return this.#deny(
        "sign",
        purpose,
        record,
        null,
        "invalid_argument",
        `${algorithm} signing failed for ${record.id}`,
      );
    }

    await this.#log(
      "sign",
      record,
      null,
      `granted: ${algorithm} over ${payload.byteLength} bytes`,
      purpose,
    );
    return {
      ok: true,
      signature: signature.toString("base64url"),
      algorithm,
      publicKey: published,
      keyFingerprint: fingerprint,
      credentialId: record.id,
    };
  }

  /* ---------------------------------------------------------------------- */

  /** What the agent is allowed to know about a purpose. Metadata, never material. */
  async describeCredential(
    purpose: string,
  ): Promise<MaterialFree<VaultToolResult<DescribeCredentialOk>>> {
    const gate = await this.#begin("describe_credential", purpose);
    if (!gate.ok) return gate.denial;

    const records = await this.#inScope(purpose);
    if (records.length === 0) {
      return this.#deny(
        "describe_credential",
        purpose,
        null,
        null,
        "out_of_scope",
        `no credential for ${purpose} is available to this agent`,
      );
    }
    const credentials: CredentialSummary[] = [];
    for (const record of records) credentials.push(await this.#summarize(record));
    await this.#log(
      "describe_credential",
      records[0] ?? null,
      null,
      `granted: ${credentials.length} credentials`,
      purpose,
    );
    return { ok: true, purpose, credentials };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /** #git implementation. */
  async #git(
    purpose: string,
    subcommand: "push" | "fetch",
    // jscpd:ignore-start -- internal/cross-file near-duplicate tool-outcome and host-check blocks kept independent per call site
    request: GitRequest,
  ): Promise<MaterialFree<VaultToolResult<AuthenticatedProcessOk>>> {
    const gate = await this.#beginProcessOperation(purpose);
    if (!gate.ok) return gate.denial;

    const found = await this.#credentialFor(purpose, request.credentialId, [
      "api_key",
      "oauth_token",
      "password",
      // jscpd:ignore-end
    ]);
    if (!found.ok) return this.#denyFound("authenticated_process", purpose, null, found);
    const record = found.record;

    let remote: URL;
    try {
      remote = new URL(request.remote);
    } catch {
      // A bare remote name resolves inside the repository, where the vault
      // cannot see which host the credential would be handed to.
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        null,
        "malformed_url",
        "the remote must be an absolute https url so its host can be checked",
      );
    }
    if (remote.protocol !== "https:") {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        remote.hostname,
        "insecure_scheme",
        `git credentials are only presented over https, not ${remote.protocol.replace(":", "")}`,
      );
    }
    if (remote.username || remote.password) {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        remote.hostname,
        "url_credentials",
        "the remote url carries userinfo credentials",
      );
    }
    const hostDenial = await this.#checkHostAllowed(
      "authenticated_process",
      purpose,
      record,
      remote.hostname,
    );
    if (hostDenial) return hostDenial;

    const secret = credentialSecret(record);
    if (!secret) {
      return this.#deny(
        "authenticated_process",
        purpose,
        record,
        remote.hostname,
        "wrong_credential_type",
        `${record.type} material cannot authenticate git`,
      );
    }
    const username =
      record.material.type === "password" ? record.material.username : "x-access-token";

    // The helper reads the secret out of the child's environment. It is not on
    // the command line, so it is not in `ps`, not in a shell history, and not in
    // the process table of a machine the agent may also be able to read.
    const helper = `!f() { test "$1" = get && printf 'username=%s\\npassword=%s\\n' "$${GIT_USER_ENV}" "$${GIT_SECRET_ENV}"; }; f`;
    const args = [
      "-c",
      `credential.helper=${helper}`,
      "-c",
      "credential.useHttpPath=true",
      subcommand,
      remote.toString(),
      ...(request.refspec ? [request.refspec] : []),
    ];

    return this.#spawn(
      "authenticated_process",
      purpose,
      record,
      {
        command: "git",
        args,
        cwd: request.cwd ?? null,
        env: {
          [GIT_USER_ENV]: username,
          [GIT_SECRET_ENV]: secret.reveal(),
          // No terminal, no askpass helper: if the stored credential is refused,
          // git must fail rather than stop and wait for a human who is not there.
          GIT_TERMINAL_PROMPT: "0",
        },
      },
      remote.hostname,
    );
  }

  /** #spawn implementation. */
  async #spawn(
    operation: VaultToolOperation,
    purpose: string,
    record: SecretRecord,
    spec: {
      command: string;
      args: readonly string[];
      cwd: string | null;
      env: Record<string, string>;
    },
    targetHost: string | null,
  ): Promise<MaterialFree<VaultToolResult<AuthenticatedProcessOk>>> {
    const runner = this.#runProcess;
    if (!runner) {
      return this.#deny(
        operation,
        purpose,
        record,
        targetHost,
        "capability_unavailable",
        "no process runner is configured for this agent",
      );
    }
    const tokens = redactionTokens(record);
    // PATH is the only inherited variable: without it a command name cannot be
    // resolved, and with the rest of the parent environment the child would
    // inherit every other secret this process holds.
    const env: Record<string, string> = { PATH: process.env.PATH ?? "", ...spec.env };
    let outcome: ProcessOutcome;
    try {
      outcome = await runner({ command: spec.command, args: [...spec.args], cwd: spec.cwd, env });
    } catch (error) {
      // Spawn errors habitually quote the whole spawn descriptor, environment
      // included, so nothing from this message survives unscrubbed.
      return this.#deny(
        operation,
        purpose,
        record,
        targetHost,
        "transport_failure",
        redact(error instanceof Error ? error.message : String(error), tokens),
      );
    }
    await this.#log(
      operation,
      record,
      targetHost,
      `granted: ${spec.command} exited ${outcome.exitCode}`,
      purpose,
    );
    return {
      ok: true,
      exitCode: outcome.exitCode,
      stdout: redact(outcome.stdout, tokens),
      stderr: redact(outcome.stderr, tokens),
      command: spec.command,
      credentialId: record.id,
    };
  }

  /** Rate limit and count. Runs before any record is even looked up. */
  async #begin(
    operation: VaultToolOperation,
    purpose: string,
  ): Promise<{ ok: true } | { ok: false; denial: VaultToolDenial }> {
    const state = this.#usageFor(purpose);
    const nowMs = this.#now();
    state.calls += 1;
    state.lastAt = nowMs;
    state.window = state.window.filter((at) => at > nowMs - this.#windowMs);
    state.window.push(nowMs);
    if (state.window.length > this.#maxCallsPerWindow) {
      const denial = await this.#deny(
        operation,
        purpose,
        null,
        null,
        "rate_limited",
        `${purpose} has been used ${state.window.length} times in the last ${this.#windowMs}ms`,
      );
      return { ok: false, denial };
    }
    return { ok: true };
  }

  /**
   * Shared by `runAuthenticatedProcess` and `#git`: both need the rate-limit
   * gate and both refuse outright when no process runner is configured.
   */
  async #beginProcessOperation(
    purpose: string,
  ): Promise<{ ok: true } | { ok: false; denial: VaultToolDenial }> {
    const gate = await this.#begin("authenticated_process", purpose);
    if (!gate.ok) return gate;
    if (!this.#runProcess) {
      const denial = await this.#deny(
        "authenticated_process",
        purpose,
        null,
        null,
        "capability_unavailable",
        "no process runner is configured for this agent",
      );
      return { ok: false, denial };
    }
    return { ok: true };
  }

  /** #usageFor implementation. */
  #usageFor(purpose: string): UsageState {
    const existing = this.#usage.get(purpose);
    if (existing) return existing;
    const created: UsageState = { calls: 0, denials: 0, window: [], lastAt: null };
    this.#usage.set(purpose, created);
    return created;
  }

  /** Records for this purpose that this agent may act with. Nothing else exists. */
  async #inScope(purpose: string): Promise<SecretRecord[]> {
    const records: SecretRecord[] = [];
    for (const id of await this.#vault.list()) {
      const record = await this.#vault.get(id);
      if (!record || record.purpose !== purpose) continue;
      if (!scopeAllows(record.scope, this.#identity)) continue;
      records.push(record);
    }
    return records;
  }

  /** #credentialFor implementation. */
  async #credentialFor(
    purpose: string,
    credentialId: string | undefined,
    preference: readonly SecretType[],
  ): Promise<
    | { ok: true; record: SecretRecord }
    | { ok: false; reason: VaultDenialReason; audit: string; agentDetail: string }
  > {
    const inScope = await this.#inScope(purpose);
    if (credentialId) {
      const exact = inScope.find((record) => record.id === credentialId);
      if (!exact) {
        // Whether the id is unknown, another purpose's, or simply not this
        // agent's is one answer to the agent and three in the audit trail.
        const existsAnywhere = (await this.#vault.list()).includes(credentialId);
        return {
          ok: false,
          reason: "out_of_scope",
          audit: existsAnywhere
            ? "record exists but is not usable by this agent for this purpose"
            : "no such record",
          agentDetail: `no credential for ${purpose} is available to this agent`,
        };
      }
      if (!preference.includes(exact.type)) {
        return {
          ok: false,
          reason: "wrong_credential_type",
          audit: `wrong type: ${exact.type}`,
          agentDetail: `${exact.id} is a ${exact.type}`,
        };
      }
      return { ok: true, record: exact };
    }
    for (const type of preference) {
      const match = inScope.find((record) => record.type === type);
      if (match) return { ok: true, record: match };
    }
    return {
      ok: false,
      reason: "out_of_scope",
      audit:
        inScope.length === 0
          ? "no record in scope for this purpose"
          : `in scope but no ${preference.join("/")} credential`,
      agentDetail: `no credential for ${purpose} is available to this agent`,
    };
  }

  /** #denyFound implementation. */
  async #denyFound(
    operation: VaultToolOperation,
    purpose: string,
    targetHost: string | null,
    found: { ok: false; reason: VaultDenialReason; audit: string; agentDetail: string },
  ): Promise<VaultToolDenial> {
    await this.#log(
      operation,
      null,
      targetHost,
      `denied: ${found.reason} (${found.audit})`,
      purpose,
    );
    this.#usageFor(purpose).denials += 1;
    return { ok: false, denial: found.reason, detail: found.agentDetail };
  }

  /** #deny implementation. */
  async #deny(
    operation: VaultToolOperation,
    purpose: string,
    record: SecretRecord | null,
    targetHost: string | null,
    reason: VaultDenialReason,
    detail: string,
  ): Promise<VaultToolDenial> {
    await this.#log(operation, record, targetHost, `denied: ${reason} (${detail})`, purpose);
    this.#usageFor(purpose).denials += 1;
    return { ok: false, denial: reason, detail };
  }

  /**
   * Shared by `authenticatedFetch` and `#git`: both attach a credential to a
   * caller-chosen host, so both must run the same allow-list check against it.
   * Returns a denial to return immediately, or null when the host is allowed.
   */
  async #checkHostAllowed(
    operation: VaultToolOperation,
    purpose: string,
    record: SecretRecord,
    hostname: string,
  ): Promise<VaultToolDenial | null> {
    const allowed = allowedHostsFor(record);
    if (allowed.length === 0) {
      return this.#deny(
        operation,
        purpose,
        record,
        hostname,
        "no_allowed_hosts",
        `no host is allow-listed for ${purpose}; add a host: tag to the record`,
      );
    }
    if (!hostAllowed(allowed, hostname)) {
      return this.#deny(
        operation,
        purpose,
        record,
        hostname,
        "host_not_allowed",
        `${hostname} is not an allowed host for ${purpose}`,
      );
    }
    return null;
  }

  /** #summarize implementation. */
  async #summarize(record: SecretRecord): Promise<CredentialSummary> {
    const descriptor = descriptorOf(record);
    const provider = findProviderDescriptor(providerIdForPurpose(record.purpose));
    let health: CredentialHealthSummary | null = null;
    if (this.#supervisor) {
      const entry = (await this.#supervisor.health()).find(
        (candidate) => candidate.id === record.id,
      );
      if (entry) {
        health = {
          state: entry.state,
          strategy: entry.strategy,
          selfHealing: entry.selfHealing,
          humanPresenceRequired: entry.humanPresenceRequired,
          nextRefreshAt: entry.nextRefreshAt,
          attempts: entry.attempts,
        };
      }
    }
    return {
      id: descriptor.id,
      type: descriptor.type,
      purpose: descriptor.purpose,
      label: descriptor.label,
      provider: provider ? provider.id : null,
      account: accountOf(record),
      expiresAt: descriptor.expiresAt,
      updatedAt: descriptor.updatedAt,
      allowedHosts: allowedHostsFor(record),
      tags: descriptor.tags,
      health,
    };
  }

  /** #log implementation. */
  async #log(
    operation: VaultToolOperation,
    record: SecretRecord | null,
    targetHost: string | null,
    outcome: string,
    // jscpd:ignore-start -- internal/cross-file near-duplicate tool-outcome and host-check blocks kept independent per call site
    purpose: string,
  ): Promise<void> {
    if (!this.#audit) return;
    await this.#audit.record({
      at: new Date(this.#now()).toISOString(),
      actor: { ...this.#identity },
      action: auditActionFor(operation),
      // jscpd:ignore-end
      recordId: record ? record.id : null,
      purpose: record ? record.purpose : purpose,
      auditRef: record ? record.auditRef : null,
      outcome,
      targetHost,
      use: this.#usageFor(purpose).calls,
    });
  }
}
