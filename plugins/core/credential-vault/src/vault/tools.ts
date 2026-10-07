/**
 * Capability tools: the only vault surface an LLM-driven agent is ever handed.
 *
 * The rule this module exists to enforce is one sentence long — *a secret value
 * never leaves the vault* — and it is worth being blunt about why the previous
 * shape could not enforce it. An agent that can call `secret()` receives
 * material into agent-visible space, and agent-visible space is a prompt, a
 * transcript, a log line, a tool argument, and an outbound request to a third
 * party. There is no discipline an agent can apply that makes a retrieved
 * secret un-retrieved. A retrievable secret is an exfiltrated secret.
 *
 * So the vault stops answering "what is the credential?" and starts answering
 * "here is the result of using it". The agent says *do this authenticated
 * thing*; the vault decides whether it may, attaches the credential itself, and
 * hands back only an outcome. Five capabilities cover what the agent actually
 * needed the material for:
 *
 * - `authenticatedFetch` — an HTTP call with the credential applied the way the
 *   provider descriptor says it should be applied.
 * - `currentTotpCode` — a live six-to-eight digit code. A code is single-use and
 *   dies in thirty seconds; the seed is forever.
 * - `runAuthenticatedProcess`, and `gitPush`/`gitFetch` over it — a child
 *   process that receives the credential through its own environment, which the
 *   parent never echoes and the result never carries.
 * - `signWith` — a signature, not a signing key.
 * - `describeCredential` — metadata, so an agent can reason about what it has
 *   without holding any of it.
 *
 * Three properties hold across all of them, and each is load-bearing.
 *
 * *The host allow-list is the centre of the design.* Attaching a credential to
 * an agent-chosen URL is the whole exfiltration path: one GitHub-authenticated
 * request to `evil.com` and the token is gone, with the vault's own hands on the
 * wheel. So every request's host is checked against a list derived from the
 * provider descriptor and from the record itself, an empty list denies
 * everything, and redirects are never followed — a 302 to another origin is
 * reported back rather than chased, because the chase would carry the header
 * across a boundary the allow-list just enforced.
 *
 * *The agent cannot participate in authentication.* An agent-supplied
 * `Authorization` header — or `Cookie`, or `x-api-key`, or the descriptor's own
 * header, or a credential in the URL's userinfo — is a refusal, not an
 * overwrite. Otherwise "let the vault attach auth" quietly becomes "let the
 * agent choose what auth is attached", and a stolen-from-somewhere-else token
 * gets laundered through a vault-audited request.
 *
 * *No return type can carry material.* `MaterialFree<T>` is a compile-time proof
 * obligation: a result type that contains a `SecretValue`, a `SecretRecord`, a
 * `SecretMaterial`, `TotpParameters`, or any function that could close over one
 * collapses to `never`, and the tool that tries to return it stops compiling.
 * That is the type system doing the work rather than a reviewer remembering to.
 * Belt and braces on top: every string that crosses back — response body,
 * response headers, stdout, stderr, error text — is scrubbed of the material
 * that was injected, because a remote endpoint that echoes its own
 * `Authorization` header would otherwise hand the agent the token by proxy.
 *
 * This file is the public entry point only. The implementation is split by
 * concern under `./tools/` — the material-free type proof, tool outcomes, the
 * transport and process seams, request/result shapes, the host allow-list,
 * auth placement, redaction, and the `VaultToolset` class itself.
 */

export type { CarriesMaterial, MaterialFree } from "./tools/material-free.js";

export {
  VAULT_DENIALS,
  type VaultDenialReason,
  type VaultToolDenial,
  type VaultToolResult,
  type VaultToolOperation,
} from "./tools/tool-outcomes.js";

export type {
  VaultTransportRequest,
  VaultTransportResponse,
  VaultTransport,
} from "./tools/transport.js";
export { defaultVaultTransport } from "./tools/transport.js";

export type { ProcessSpec, ProcessOutcome, ProcessRunner } from "./tools/process-runner.js";
export { nodeProcessRunner } from "./tools/process-runner.js";

export type {
  AuthenticatedFetchRequest,
  CredentialHealthSummary,
  CredentialSummary,
  AuthenticatedFetchOk,
  TotpCodeOk,
  AuthenticatedProcessRequest,
  AuthenticatedProcessOk,
  GitRequest,
  SignRequest,
  SignOk,
  DescribeCredentialOk,
  VaultToolUsage,
} from "./tools/requests.js";

export { providerIdForPurpose, allowedHostsFor, hostAllowed } from "./tools/host-allowlist.js";
export type { AuthPlacement } from "./tools/auth-placement.js";
export { authPlacementFor } from "./tools/auth-placement.js";

export {
  VaultToolset,
  type VaultToolLimits,
  type VaultToolsetOptions,
} from "./tools/toolset.js";
