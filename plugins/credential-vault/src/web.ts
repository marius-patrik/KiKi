/**
 * Vault management web surface: a self-contained `/vault` page and its JSON
 * API over `ctx.accounts`. The page lists stored credentials by canonical
 * reference with their purpose and origin, reveals a single value on demand,
 * and stores or removes values — the browser side of the account manager the
 * CLI (`dsh accounts`) already provides.
 *
 * Material discipline: list output never carries secret material; a value is
 * revealed only through the single-ref reveal route, so the list page cannot
 * leak everything at once. The routes trust the harness localhost web server
 * model (unauthenticated 127.0.0.1), consistent with the rest of the web UI.
 * @module credentials/web
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { AccountsService } from "./index.js";
import {
  PROVIDER_LOGINS,
  requestDeviceCode,
  pollDeviceToken,
  startCliLogin,
  pollCliLogin,
  completeCliLogin,
  submitCliAuthCode,
  type DeviceFlowProvider,
  type CliLoginProvider,
} from "./login.js";

/** In-memory map of active device flow poll sessions. Keyed by random poll token. */
const devicePollState = new Map<
  string,
  { provider: DeviceFlowProvider; device: { device_code: string }; createdAt: number }
>();

/** The prefix route mounting the page and API. */
export const VAULT_PREFIX = "/vault";

/** Canonical references the UI offers as quick-add affordances. */
export const KNOWN_REF_NAMES: readonly string[] = [
  "CLAUDE_SUB_OAUTH_TOKEN",
  "CLAUDE_API_KEY",
  "CURSOR_SUB_TOKEN",
  "CURSOR_EMAIL",
  "CURSOR_SIGNUP_TYPE",
  "GROK_SUB_OAUTH_TOKEN",
  "KIMI_SUB_OAUTH_TOKEN",
  "KIMI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MISTRAL_API_KEY",
  "ANTIGRAVITY_PROJECT",
  "ZEN_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "GITHUB_OAUTH_TOKEN",
  "GITHUB_USER",
  "GITHUB_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_HOST",
];

/** The largest accepted request body (a stored secret). */
const MAX_BODY_BYTES = 1024 * 1024;

/** A reference is valid when it decodes to a path-safe uppercase name. */
function isValidRef(ref: string): boolean {
  return /^[A-Z0-9_][A-Z0-9_.-]*$/.test(ref);
}

/** JSON helper: one stable error shape with a status and a plain message. */
// jscpd:ignore-start -- internal near-duplicate route-handler blocks for distinct endpoints; also mirrors plugin-kit/src/json-response.ts's inline shape before that helper existed here
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}
// jscpd:ignore-end

/** Consume a request body, bounded by {@link MAX_BODY_BYTES}. */
function readBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * One list row: the canonical reference, its account tag when present, its
 * material kind, whether the vault holds it, whether the harness credential
 * seam resolves it, and the known quick-add set index.
 */
export interface VaultListRow {
  ref: string;
  account: string | null;
  kind: string;
  purpose: string | null;
  label: string | null;
  expiresAt: string | null;
  inVault: boolean;
  ambient: boolean;
}

/** Build the list rows for the page: vault-held refs first, then quick-adds. */
export async function listRows(accounts: AccountsService): Promise<VaultListRow[]> {
  const held = await accounts.accounts();
  const heldRefs = new Set(held.map((entry) => entry.ref));
  const rows: VaultListRow[] = [];
  const /** push implementation. */
    push = async (
      ref: string,
      account: string | null,
      metadata?: { kind: string; purpose: string; label: string; expiresAt: string | null },
    ): Promise<void> => {
      const resolved = await accounts.resolve(ref);
      rows.push({
        ref,
        account,
        kind: metadata?.kind ?? "api_key",
        purpose: metadata?.purpose ?? null,
        label: metadata?.label ?? null,
        expiresAt: metadata?.expiresAt ?? null,
        inVault: heldRefs.has(ref),
        ambient: resolved?.origin === "credentials",
      });
    };
  for (const entry of held) await push(entry.ref, entry.account, entry);
  for (const ref of KNOWN_REF_NAMES) {
    if (heldRefs.has(ref)) continue;
    await push(ref, null);
  }
  return rows;
}

/** The JSON API handler under the `/vault` prefix. */
export function makeVaultHandler(
  accounts: AccountsService,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://vault.local");
    const pathname = url.pathname;
    try {
      if (pathname === VAULT_PREFIX) {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(renderVaultPage());
        return;
      }
      if (pathname === `${VAULT_PREFIX}/api/accounts`) {
        if (req.method === "GET") {
          sendJson(res, 200, { rows: await listRows(accounts) });
          return;
        }
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }

      // ---- Login flow endpoints ----

      if (pathname === `${VAULT_PREFIX}/api/login/providers` && req.method === "GET") {
        sendJson(res, 200, {
          providers: PROVIDER_LOGINS.map((p) => ({
            id: p.id,
            label: p.label,
            kind: p.kind,
            description:
              p.kind === "manual"
                ? p.description
                : p.kind === "cli"
                  ? "CLI-based sign in (opens browser)"
                  : undefined,
          })),
        });
        return;
      }

      // jscpd:ignore-start -- internal near-duplicate route-handler blocks for distinct endpoints; also mirrors plugin-kit/src/json-response.ts's inline shape before that helper existed here
      if (pathname === `${VAULT_PREFIX}/api/login/device/start` && req.method === "POST") {
        const body = await readBody(req);
        let parsed: { providerId?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "request body must be JSON" });
          return;
        }
        const provider = PROVIDER_LOGINS.find(
          (p) => p.id === parsed.providerId && p.kind === "device",
          // jscpd:ignore-end
        ) as DeviceFlowProvider | undefined;
        if (!provider) {
          sendJson(res, 404, {
            error: `unknown device provider: ${JSON.stringify(parsed.providerId)}`,
          });
          return;
        }
        try {
          const device = await requestDeviceCode(provider);
          // Store the device code in a short-lived in-memory map keyed by a random token
          const pollToken = randomBytes(16).toString("hex");
          devicePollState.set(pollToken, { provider, device, createdAt: Date.now() });
          // Auto-expire after 10 minutes
          setTimeout(
            () => {
              devicePollState.delete(pollToken);
            },
            10 * 60 * 1000,
          );
          sendJson(res, 200, {
            pollToken,
            verificationUri: device.verification_uri_complete ?? device.verification_uri,
            userCode: device.user_code,
            expiresIn: device.expires_in ?? 300,
          });
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (pathname === `${VAULT_PREFIX}/api/login/device/poll` && req.method === "POST") {
        const body = await readBody(req);
        let parsed: { pollToken?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "request body must be JSON" });
          return;
        }
        const state = parsed.pollToken ? devicePollState.get(parsed.pollToken) : undefined;
        if (!state) {
          sendJson(res, 404, { error: "invalid or expired poll token" });
          return;
        }
        try {
          const result = await pollDeviceToken(state.provider, state.device.device_code);
          if (!result) {
            sendJson(res, 200, { status: "pending" });
            return;
          }
          // Success — write tokens to vault
          const now = new Date().toISOString();
          const expiresAt = result.expires_in
            ? new Date(Date.now() + result.expires_in * 1000).toISOString()
            : null;
          const refs = state.provider.vaultRefs;
          if (result.access_token) await accounts.set(refs.accessToken, result.access_token);
          if (result.refresh_token && refs.refreshToken)
            await accounts.set(refs.refreshToken, result.refresh_token);
          // The expiry REF is consumed by providers as epoch millis; the ISO form stays display-only.
          if (expiresAt && refs.expires)
            await accounts.set(refs.expires, String(Date.parse(expiresAt)));
          devicePollState.delete(parsed.pollToken!);
          sendJson(res, 200, { status: "authenticated", expiresAt });
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (pathname === `${VAULT_PREFIX}/api/login/manual` && req.method === "POST") {
        const body = await readBody(req);
        let parsed: { providerId?: string; token?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "request body must be JSON" });
          return;
        }
        const found = PROVIDER_LOGINS.find(
          (p) => p.id === parsed.providerId && p.kind === "manual",
        );
        if (!found || found.kind !== "manual") {
          sendJson(res, 404, {
            error: `unknown manual provider: ${JSON.stringify(parsed.providerId)}`,
          });
          return;
        }
        if (!parsed.token || parsed.token.trim().length === 0) {
          sendJson(res, 400, { error: "token is required" });
          return;
        }
        await accounts.set(found.vaultRef, parsed.token.trim());
        sendJson(res, 200, { ok: true, ref: found.vaultRef });
        return;
      }

      // ---- CLI login flow endpoints ----

      // jscpd:ignore-start -- internal near-duplicate route-handler blocks for distinct endpoints; also mirrors plugin-kit/src/json-response.ts's inline shape before that helper existed here
      if (pathname === `${VAULT_PREFIX}/api/login/cli/start` && req.method === "POST") {
        const body = await readBody(req);
        let parsed: { providerId?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "request body must be JSON" });
          return;
        }
        const provider = PROVIDER_LOGINS.find(
          (p) => p.id === parsed.providerId && p.kind === "cli",
          // jscpd:ignore-end
        ) as CliLoginProvider | undefined;
        if (!provider) {
          sendJson(res, 404, {
            error: `unknown CLI provider: ${JSON.stringify(parsed.providerId)}`,
          });
          return;
        }
        try {
          const result = await startCliLogin(provider);
          sendJson(res, 200, {
            sessionToken: result.sessionToken,
            message: result.message,
          });
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (pathname === `${VAULT_PREFIX}/api/login/cli/poll` && req.method === "POST") {
        const body = await readBody(req);
        let parsed: { sessionToken?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "request body must be JSON" });
          return;
        }
        if (!parsed.sessionToken) {
          sendJson(res, 400, { error: "sessionToken is required" });
          return;
        }
        try {
          const status = await pollCliLogin(parsed.sessionToken);
          if (status.status === "authenticated") {
            // Capture the token and store it
            const result = await completeCliLogin(parsed.sessionToken);
            if (result) {
              const refs = result.provider.vaultRefs;
              const full = result.full;
              await accounts.set(refs.accessToken, full?.accessToken ?? result.token);
              if (full?.refreshToken && refs.refreshToken)
                await accounts.set(refs.refreshToken, full.refreshToken);
              if (full?.expiresAt && refs.expires)
                await accounts.set(
                  refs.expires,
                  String(Number(full.expiresAt) || Date.parse(full.expiresAt)),
                );
              sendJson(res, 200, {
                status: "authenticated",
                ref: refs.accessToken,
                expiresAt: full?.expiresAt ?? null,
              });
            } else {
              sendJson(res, 200, { status: "error", error: "Failed to capture token" });
            }
          } else if (status.status === "error") {
            sendJson(res, 200, { status: "error", error: status.error });
          } else if (status.status === "waiting_for_code") {
            sendJson(res, 200, {
              status: "waiting_for_code",
              authUrl: status.authUrl,
              browserOpened: status.browserOpened,
            });
          } else {
            sendJson(res, 200, { status: "pending" });
          }
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (pathname === `${VAULT_PREFIX}/api/login/cli/submit-code` && req.method === "POST") {
        const body = await readBody(req);
        let parsed: { sessionToken?: string; code?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "request body must be JSON" });
          return;
        }
        if (!parsed.sessionToken || !parsed.code) {
          sendJson(res, 400, { error: "sessionToken and code are required" });
          return;
        }
        try {
          const ok = await submitCliAuthCode(parsed.sessionToken, parsed.code);
          sendJson(res, 200, { ok });
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      const prefix = `${VAULT_PREFIX}/api/accounts/`;
      if (pathname.startsWith(prefix)) {
        const ref = decodeURIComponent(pathname.slice(prefix.length));
        if (!isValidRef(ref)) {
          sendJson(res, 400, { error: `invalid reference: ${JSON.stringify(ref)}` });
          return;
        }
        switch (req.method) {
          case "GET": {
            const account = url.searchParams.get("account") ?? undefined;
            const resolved =
              account !== undefined
                ? await accounts.resolveFor(ref, account)
                : await accounts.resolve(ref);
            sendJson(res, 200, { ref, account: account ?? null, value: resolved?.value ?? null });
            return;
          }
          case "PUT": {
            const body = await readBody(req);
            let parsed: unknown;
            try {
              parsed = JSON.parse(body);
            } catch {
              sendJson(res, 400, { error: "request body must be JSON" });
              return;
            }
            const value = (parsed as { value?: unknown }).value;
            if (typeof value !== "string" || value.length === 0) {
              sendJson(res, 400, { error: 'a non-empty string "value" is required' });
              return;
            }
            const account = url.searchParams.get("account") ?? undefined;
            await accounts.set(ref, value, account);
            sendJson(res, 200, { ok: true, ref, account: account ?? null });
            return;
          }
          case "DELETE": {
            const account = url.searchParams.get("account") ?? undefined;
            await accounts.unset(ref, account);
            sendJson(res, 200, { ok: true, ref, account: account ?? null });
            return;
          }
          default:
            sendJson(res, 405, { error: "method not allowed" });
        }
        return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: message });
    }
  };
}

/**
 * Mount the vault web surface on the harness web server. Returns the inject
 * fiber so `apply` composes it; nothing is registered when the web server is
 * absent (CLI-only profiles).
 */
export function mountVaultWeb(ctx: Context, accounts: AccountsService): unknown {
  return ctx.inject(["webServer"], (httpCtx) => {
    return httpCtx.webServer.register({
      kind: "prefix",
      path: VAULT_PREFIX,
      handler: makeVaultHandler(accounts),
    });
  });
}

/** The self-contained vault page: styles use the harness semantic tokens. */
function renderVaultPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Keychain — credentials</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 18px;
        color: var(--dsw-alias-label-primary, #202124);
        background: var(--dsw-alias-bg-app, #f8f8f8);
      }
      .shell { min-height: 100vh; }
      .topbar {
        display: flex; align-items: center; gap: 12px;
        height: 52px; padding: 0 28px;
        border-bottom: 1px solid var(--dsw-alias-border-l2, #ddd);
        background: var(--dsw-alias-bg-app, #f8f8f8);
      }
      .back {
        color: var(--dsw-alias-label-secondary, #666); text-decoration: none;
        font-size: 12px; font-weight: 500;
      }
      .back:hover { color: var(--dsw-alias-label-primary, #202124); }
      .crumb { color: var(--dsw-alias-label-tertiary, #999); font-size: 12px; }
      .content { max-width: 920px; margin: 0 auto; padding: 34px 28px 72px; }
      .eyebrow {
        color: var(--dsw-alias-label-tertiary, #888); font-size: 11px;
        font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
      }
      h1 { margin: 6px 0 6px; font-size: 24px; line-height: 30px; letter-spacing: -.02em; font-weight: 650; }
      .lede { max-width: 620px; margin: 0; color: var(--dsw-alias-label-secondary, #666); }
      .heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
      .heading .badge { margin-top: 8px; }
      .panel {
        margin-top: 28px; overflow: hidden;
        border: 1px solid var(--dsw-alias-border-l2, #ddd);
        border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff);
        box-shadow: 0 1px 2px rgba(0,0,0,.04);
      }
      .panel-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #eee); }
      .panel-head strong { font-size: 13px; }
      .panel-head span { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; }
      .toolbar { display: flex; gap: 8px; margin-left: auto; }
      .toolbar input {
        width: 220px;
        min-width: 0;
        padding: 7px 10px;
        border: 1px solid var(--dsw-alias-border-l2, #ccc);
        border-radius: 7px;
        background: var(--dsw-alias-bg-layer-2, #fff);
        color: inherit;
        font: inherit;
      }
      button {
        padding: 7px 11px;
        border: none;
        border-radius: 7px;
        background: var(--dsw-alias-state-business-primary, #1a73e8);
        color: #fff;
        font: inherit;
        font-weight: 550;
        cursor: pointer;
      }
      button.ghost {
        background: var(--dsw-alias-interactive-bg-hover, #e8eaed);
        color: var(--dsw-alias-label-primary, #202124);
      }
      button.danger { background: var(--dsw-alias-state-error-primary, #d93025); }
      button:disabled { opacity: 0.5; cursor: default; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #eee); }
      th { color: var(--dsw-alias-label-tertiary, #888); font-weight: 500; font-size: 12px; }
      td.ref { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
      .badge {
        display: inline-block; padding: 2px 8px; border-radius: 999px;
        font-size: 11px; background: var(--dsw-alias-interactive-bg-hover, #eee);
      }
      .badge.vault { background: #e8f0fe; color: #1a73e8; }
      .badge.ambient { background: #fef7e0; color: #b06000; }
      .actions { display: flex; gap: 6px; justify-content: flex-end; }
      .empty { color: var(--dsw-alias-label-secondary, #555); padding: 24px; text-align: center; }
      .error { color: var(--dsw-alias-state-error-primary, #d93025); margin: 8px 0; }
      dialog { border: 1px solid var(--dsw-alias-border-l2, #ccc); border-radius: 12px; padding: 0; width: 480px; max-width: calc(100vw - 32px); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
      dialog::backdrop { background: rgba(0,0,0,.35); }
      dialog form { padding: 20px; display: grid; gap: 12px; }
      dialog label { font-size: 12px; color: var(--dsw-alias-label-secondary, #555); }
      dialog input, dialog textarea {
        width: 100%; padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l2, #ccc);
        border-radius: 7px; background: var(--dsw-alias-bg-layer-2, #fff); color: inherit; font: inherit;
      }
      dialog .row { display: flex; gap: 8px; justify-content: flex-end; }
      dialog .device-code { font-size: 28px; font-weight: 700; letter-spacing: 4px; text-align: center; padding: 16px; background: var(--dsw-alias-interactive-bg-hover, #f0f0f0); border-radius: 8px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
      dialog .verify-link { text-align: center; }
      dialog .verify-link a { color: #1a73e8; text-decoration: underline; }
      dialog .status { text-align: center; padding: 12px; color: var(--dsw-alias-label-secondary, #555); }
      .login-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
      .login-card { border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
      .login-card .name { font-weight: 600; }
      .login-card .desc { font-size: 12px; color: var(--dsw-alias-label-secondary, #555); flex: 1; }
      .login-card button { align-self: stretch; }
      button.primary { background: #1a73e8; color: #fff; border: none; padding: 8px 16px; border-radius: 7px; cursor: pointer; font: inherit; }
      button.primary:disabled { opacity: 0.5; cursor: default; }
      @media (max-width: 640px) {
        .topbar { padding: 0 16px; }
        .content { padding: 24px 16px 48px; }
        .heading { display: block; }
        .heading .badge { margin-top: 12px; }
        .panel-head { align-items: stretch; flex-wrap: wrap; }
        .toolbar { width: 100%; margin-left: 0; }
        .toolbar input { flex: 1; width: auto; }
        th:nth-child(2), td:nth-child(2) { display: none; }
        th, td { padding: 10px 12px; }
        .actions { flex-wrap: wrap; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <nav class="topbar"><a class="back" href="/">Back to chat</a><span class="crumb">/</span><span class="crumb">Settings</span><span class="crumb">/</span><strong>Keychain</strong></nav>
      <main class="content">
        <div class="heading">
         <div><div class="eyebrow">Settings / Keychain</div><h1>Keychain</h1><p class="lede">Manage encrypted credentials, logins, and recovery material used by your providers and tools. Values stay hidden until you request one.</p></div>
          <span class="badge vault">Encrypted at rest</span>
        </div>
        <section class="panel">
          <div class="panel-head"><strong>Subscription Logins</strong><span>Sign in to your subscription providers</span></div>
          <div class="login-grid" id="loginProviders"></div>
        </section>
        <section class="panel">
          <div class="panel-head"><strong>Credentials</strong><span>Stored and recognized references</span><div class="toolbar"><input id="filter" type="search" placeholder="Filter references" /><button id="add" type="button">Add credential</button></div></div>
          <div id="error" class="error"></div>
          <table><thead><tr><th>Reference</th><th>Purpose / account</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table>
          <div id="empty" class="empty" hidden>No credentials match this filter.</div>
        </section>
      </main>
    </div>
    <dialog id="editor">
      <form method="dialog" id="editorForm">
        <label>Reference (canonical name, e.g. OPENAI_API_KEY)
          <input id="ref" name="ref" required pattern="[A-Z0-9_][A-Z0-9_.-]*" autocomplete="off" />
        </label>
        <label>Value
          <textarea id="value" name="value" required rows="3" autocomplete="off" spellcheck="false"></textarea>
        </label>
        <div class="row">
          <button type="button" id="cancel" class="ghost">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </dialog>
    <dialog id="deviceDialog">
      <form method="dialog" id="deviceForm">
        <div id="deviceContent">
          <div class="status" id="deviceStatus">Requesting device code...</div>
          <div class="device-code" id="deviceCode" hidden></div>
          <div class="verify-link" id="deviceLink" hidden></div>
          <div class="status" id="devicePollStatus" hidden>Waiting for authorization...</div>
        </div>
        <div class="row">
          <button type="button" id="deviceCancel" class="ghost">Cancel</button>
        </div>
      </form>
    </dialog>
    <dialog id="manualDialog">
      <form method="dialog" id="manualForm">
        <div id="manualLabel" style="font-weight:600;margin-bottom:4px;"></div>
        <div id="manualDesc" style="font-size:12px;color:var(--dsw-alias-label-secondary,#555);margin-bottom:8px;"></div>
        <label>Paste token
          <textarea id="manualToken" name="token" required rows="3" autocomplete="off" spellcheck="false"></textarea>
        </label>
        <div class="row">
          <button type="button" id="manualCancel" class="ghost">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </dialog>
    <dialog id="cliDialog">
      <form method="dialog" id="cliForm">
        <div id="cliContent">
          <div class="status" id="cliStatus">Launching CLI login...</div>
          <div class="status" id="cliPollStatus" hidden>Waiting for authentication...</div>
          <div id="cliAuthUrlSection" hidden style="margin: 12px 0;">
            <div style="font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 6px;">Authorization URL (opens automatically):</div>
            <a id="cliAuthUrl" href="#" target="_blank" style="font-size: 11px; word-break: break-all; color: var(--dsw-alias-label-link);"></a>
          </div>
          <div id="cliCodeSection" hidden style="margin: 12px 0;">
            <div style="font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 6px;">Paste the authorization code from the browser:</div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="cliCodeInput" placeholder="Authorization code" style="flex: 1; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; font-size: 13px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);" />
              <button type="button" id="cliCodeSubmit" style="padding: 6px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 13px;">Submit</button>
            </div>
          </div>
        </div>
        <div class="row">
          <button type="button" id="cliCancel" class="ghost">Cancel</button>
        </div>
      </form>
    </dialog>
    <script type="module">
      const rowsEl = document.getElementById('rows');
      const emptyEl = document.getElementById('empty');
      const errorEl = document.getElementById('error');
      const editor = document.getElementById('editor');
      const filter = document.getElementById('filter');
      let currentRows = [];
      const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
      const setError = (message) => { errorEl.textContent = message || ''; };
      async function load() {
        const response = await fetch('/vault/api/accounts');
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'list failed');
        currentRows = body.rows || [];
        render();
      }
      function render() {
        const query = filter.value.trim().toLowerCase();
        const visible = currentRows.filter((row) => !query || row.ref.toLowerCase().includes(query));
        rowsEl.innerHTML = visible.map((row) => {
          const badges = [];
          if (row.inVault) badges.push('<span class="badge vault">vault</span>');
          if (row.ambient) badges.push('<span class="badge ambient">env</span>');
          if (badges.length === 0) badges.push('<span class="badge">empty</span>');
           const meta = [row.label || row.purpose, row.account, row.kind].filter(Boolean).join(' · ');
          return '<tr>'
            + '<td class="ref">' + escapeHtml(row.ref) + '</td>'
            + '<td>' + escapeHtml(meta) + '</td>'
            + '<td>' + badges.join(' ') + '</td>'
            + '<td><div class="actions">'
            + '<button class="ghost" data-reveal="' + escapeHtml(row.ref) + '">Show</button>'
            + '<button class="ghost" data-edit="' + escapeHtml(row.ref) + '">Edit</button>'
            + '<button class="danger" data-delete="' + escapeHtml(row.ref) + '">Delete</button>'
            + '</div></td></tr>';
        }).join('');
        emptyEl.hidden = visible.length > 0;
      }
      async function reveal(ref) {
        setError('');
        try {
          const response = await fetch('/vault/api/accounts/' + encodeURIComponent(ref));
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'reveal failed');
          if (body.value === null) { alert(ref + ' is not stored in the vault.'); return; }
          const text = prompt('Value for ' + ref + ':', body.value);
          if (text !== null && typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(text).catch(() => {});
          }
        } catch (error) { setError(String(error.message || error)); }
      }
      function openEditor(refValue, value) {
        editor.querySelector('#ref').value = refValue || '';
        editor.querySelector('#value').value = value || '';
        editor.querySelector('#ref').disabled = Boolean(refValue);
        editor.showModal();
      }
      editor.querySelector('#cancel').addEventListener('click', () => editor.close());
      editor.querySelector('#editorForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        setError('');
        const ref = editor.querySelector('#ref').value.trim();
        const value = editor.querySelector('#value').value;
        try {
          const response = await fetch('/vault/api/accounts/' + encodeURIComponent(ref), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ value }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'save failed');
          editor.close();
          await load();
        } catch (error) { setError(String(error.message || error)); }
      });
      async function remove(ref) {
        if (!confirm('Delete ' + ref + ' from the vault?')) return;
        setError('');
        try {
          const response = await fetch('/vault/api/accounts/' + encodeURIComponent(ref), { method: 'DELETE' });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'delete failed');
          await load();
        } catch (error) { setError(String(error.message || error)); }
      }
      rowsEl.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-reveal], button[data-edit], button[data-delete]');
        if (!button) return;
        if (button.dataset.reveal) reveal(button.dataset.reveal);
        else if (button.dataset.edit) openEditor(button.dataset.edit, '');
        else if (button.dataset.delete) remove(button.dataset.delete);
      });
      document.getElementById('add').addEventListener('click', () => openEditor('', ''));
      filter.addEventListener('input', () => render());
      load().catch((error) => setError(String(error.message || error)));

      // ---- Subscription login flows ----

      const deviceDialog = document.getElementById('deviceDialog');
      const manualDialog = document.getElementById('manualDialog');
      let activePollInterval = null;

      async function loadProviders() {
        try {
          const response = await fetch('/vault/api/login/providers');
          const body = await response.json();
          const grid = document.getElementById('loginProviders');
          grid.innerHTML = (body.providers || []).map((p) => {
            const kindLabel = p.kind === 'device' ? 'Browser-based sign in' : p.kind === 'cli' ? 'CLI-based sign in (opens browser)' : (p.description || 'Paste token');
            const btnLabel = p.kind === 'device' ? 'Sign in' : p.kind === 'cli' ? 'Sign in' : 'Paste token';
            return '<div class="login-card">'
            + '<div class="name">' + escapeHtml(p.label) + '</div>'
            + '<div class="desc">' + escapeHtml(kindLabel) + '</div>'
            + '<button class="primary" data-login="' + escapeHtml(p.id) + '" data-kind="' + escapeHtml(p.kind) + '">'
            + btnLabel + '</button>'
            + '</div>';
          }).join('');
        } catch (error) { setError(String(error.message || error)); }
      }

      async function startDeviceFlow(providerId) {
        deviceDialog.querySelector('#deviceStatus').textContent = 'Requesting device code...';
        deviceDialog.querySelector('#deviceCode').hidden = true;
        deviceDialog.querySelector('#deviceLink').hidden = true;
        deviceDialog.querySelector('#devicePollStatus').hidden = true;
        deviceDialog.showModal();
        try {
          const response = await fetch('/vault/api/login/device/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerId }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'failed to start device flow');
          deviceDialog.querySelector('#deviceStatus').textContent = 'Open the link below and enter the code:';
          deviceDialog.querySelector('#deviceCode').textContent = body.userCode;
          deviceDialog.querySelector('#deviceCode').hidden = false;
          deviceDialog.querySelector('#deviceLink').innerHTML = '<a href="' + escapeHtml(body.verificationUri) + '" target="_blank" rel="noopener">' + escapeHtml(body.verificationUri) + '</a>';
          deviceDialog.querySelector('#deviceLink').hidden = false;
          deviceDialog.querySelector('#devicePollStatus').hidden = false;
          deviceDialog.querySelector('#devicePollStatus').textContent = 'Waiting for authorization...';
          // Start polling
          if (activePollInterval) clearInterval(activePollInterval);
          activePollInterval = setInterval(async () => {
            try {
              const pollResponse = await fetch('/vault/api/login/device/poll', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ pollToken: body.pollToken }),
              });
              const pollBody = await pollResponse.json();
              if (pollBody.status === 'authenticated') {
                clearInterval(activePollInterval);
                activePollInterval = null;
                deviceDialog.querySelector('#devicePollStatus').textContent = 'Authenticated!';
                setTimeout(() => { deviceDialog.close(); loadProviders(); load(); }, 1000);
              } else if (pollBody.error) {
                clearInterval(activePollInterval);
                activePollInterval = null;
                deviceDialog.querySelector('#devicePollStatus').textContent = 'Error: ' + pollBody.error;
              }
            } catch { /* transient network error, keep polling */ }
          }, 5000);
        } catch (error) {
          deviceDialog.querySelector('#deviceStatus').textContent = 'Error: ' + (error.message || error);
        }
      }

      function openManualLogin(providerId, label, description) {
        document.getElementById('manualLabel').textContent = label;
        document.getElementById('manualDesc').textContent = description;
        document.getElementById('manualToken').value = '';
        document.getElementById('manualToken').dataset.providerId = providerId;
        manualDialog.showModal();
      }

      document.getElementById('deviceCancel').addEventListener('click', () => {
        if (activePollInterval) { clearInterval(activePollInterval); activePollInterval = null; }
        deviceDialog.close();
      });
      document.getElementById('manualCancel').addEventListener('click', () => manualDialog.close());
      document.getElementById('manualForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const providerId = document.getElementById('manualToken').dataset.providerId;
        const token = document.getElementById('manualToken').value.trim();
        try {
          const response = await fetch('/vault/api/login/manual', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerId, token }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'save failed');
          manualDialog.close();
          await loadProviders();
          await load();
        } catch (error) { setError(String(error.message || error)); }
      });

      document.getElementById('loginProviders').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-login]');
        if (!button) return;
        const id = button.dataset.login;
        const kind = button.dataset.kind;
        if (kind === 'device') startDeviceFlow(id);
        else if (kind === 'cli') startCliLoginFlow(id);
        else {
          const card = button.closest('.login-card');
          const label = card.querySelector('.name').textContent;
          const desc = card.querySelector('.desc').textContent;
          openManualLogin(id, label, desc);
        }
      });

      // ---- CLI login flows ----

      const cliDialog = document.getElementById('cliDialog');
      let activeCliPollInterval = null;
      let activeCliSessionToken = null;

      async function startCliLoginFlow(providerId) {
        cliDialog.querySelector('#cliStatus').textContent = 'Launching CLI login...';
        cliDialog.querySelector('#cliPollStatus').hidden = true;
        cliDialog.querySelector('#cliAuthUrlSection').hidden = true;
        cliDialog.querySelector('#cliCodeSection').hidden = true;
        cliDialog.querySelector('#cliCodeInput').value = '';
        cliDialog.showModal();
        try {
          const response = await fetch('/vault/api/login/cli/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerId }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'failed to start CLI login');
          activeCliSessionToken = body.sessionToken;
          cliDialog.querySelector('#cliStatus').textContent = body.message || 'Complete the login in the browser window.';
          cliDialog.querySelector('#cliPollStatus').hidden = false;
          cliDialog.querySelector('#cliPollStatus').textContent = 'Waiting for authentication...';
          // Start polling
          if (activeCliPollInterval) clearInterval(activeCliPollInterval);
          activeCliPollInterval = setInterval(async () => {
            try {
              const pollResponse = await fetch('/vault/api/login/cli/poll', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sessionToken: activeCliSessionToken }),
              });
              const pollBody = await pollResponse.json();
              if (pollBody.status === 'authenticated') {
                clearInterval(activeCliPollInterval);
                activeCliPollInterval = null;
                cliDialog.querySelector('#cliPollStatus').textContent = 'Authenticated!';
                cliDialog.querySelector('#cliAuthUrlSection').hidden = true;
                cliDialog.querySelector('#cliCodeSection').hidden = true;
                setTimeout(() => { cliDialog.close(); loadProviders(); load(); }, 1000);
              } else if (pollBody.status === 'error') {
                clearInterval(activeCliPollInterval);
                activeCliPollInterval = null;
                cliDialog.querySelector('#cliPollStatus').textContent = 'Error: ' + (pollBody.error || 'unknown error');
              } else if (pollBody.status === 'waiting_for_code') {
                cliDialog.querySelector('#cliPollStatus').textContent = 'Authorization URL opened. Paste the code from the browser.';
                if (pollBody.authUrl) {
                  const urlSection = cliDialog.querySelector('#cliAuthUrlSection');
                  const urlLink = cliDialog.querySelector('#cliAuthUrl');
                  urlLink.href = pollBody.authUrl;
                  urlLink.textContent = pollBody.authUrl;
                  urlSection.hidden = false;
                }
                cliDialog.querySelector('#cliCodeSection').hidden = false;
              }
            } catch { /* transient network error, keep polling */ }
          }, 2000);
        } catch (error) {
          cliDialog.querySelector('#cliStatus').textContent = 'Error: ' + (error.message || error);
        }
      }

      document.getElementById('cliCodeSubmit').addEventListener('click', async () => {
        const code = cliDialog.querySelector('#cliCodeInput').value.trim();
        if (!code || !activeCliSessionToken) return;
        try {
          await fetch('/vault/api/login/cli/submit-code', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionToken: activeCliSessionToken, code }),
          });
          cliDialog.querySelector('#cliCodeSection').hidden = true;
          cliDialog.querySelector('#cliPollStatus').textContent = 'Code submitted, waiting for authentication...';
        } catch { /* keep polling */ }
      });

      document.getElementById('cliCancel').addEventListener('click', () => {
        if (activeCliPollInterval) { clearInterval(activeCliPollInterval); activeCliPollInterval = null; }
        activeCliSessionToken = null;
        cliDialog.close();
      });

      loadProviders().catch((error) => setError(String(error.message || error)));
    </script>
  </body>
</html>`;
}
