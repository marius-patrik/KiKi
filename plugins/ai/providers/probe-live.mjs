#!/usr/bin/env node
/** Live wire-truth probe: every provider route against its REAL endpoint with
 * REAL vault credentials — resolve (with refresh) + minimal streamed completion.
 * Usage: node probe-live.mjs [provider-id ...] */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as providers from "./lib/index.js";
import * as dialects from "@dsh-stack/dialects";
import { Context } from "@deepseek-ai/cordis";
import { AccountsService } from "../credential-vault/lib/index.js";
import { stubSettingsService } from "../../../scripts/plugin-check-kit.mjs";

const home = resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
const ctx = new Context();
dialects.apply(ctx, {});
// Use the REAL AccountsService (multi-account, importers, fallbacks) —
// anything less is a shim that disagrees with what the live server resolves.
const accounts = new AccountsService(ctx, { home, keyFile: join(home, "accounts.key") });
const llm = {
  configurable: [],
  adapter: undefined,
  /** registerConfigurableProviders implementation. */
  registerConfigurableProviders(entries) {
    this.configurable.push(...entries);
  },
  /** registerAdapter implementation. */
  registerAdapter(_ids, adapter) {
    this.adapter = adapter;
    return { replace: () => {}, dispose: () => {} };
  },
};
ctx.provide("llm", llm);
ctx.provide("settings", stubSettingsService().service);
// The config is built through the plugin's own `Config` schema, exactly as the
// Loader builds it: `mode` is a volatile field, so what `apply` reads is a live
// reference rather than the value that was configured.
providers.apply(ctx, providers.Config["~standard"].validate({ mode: "all" }).value);
// Every route now lives in its own @dsh-stack/provider-<id> extension; load
// them all so this probe still sees the full catalog it used to get from the
// static table.
const EXTENSION_IDS = [
  "kimi-code",
  "kimi-sub",
  "claude-sub",
  "grok-sub",
  "gemini-sub",
  "antigravity-sub",
  "openai-api",
  "anthropic-api",
  "gemini-api",
  "grok-api",
  "deepseek-api",
  "mistral-api",
  "groq-api",
  "openrouter-api",
  "cerebras-api",
  "zai-api",
  "zen",
  "ollama",
  "llamacpp",
  "vllm",
];
for (const id of EXTENSION_IDS) {
  const extension = await import(`../../extensions/provider-${id}/lib/index.js`);
  extension.apply(ctx);
}
// sanity: accounts service read path
const probe = await accounts.resolve("KIMI_SUB_OAUTH_TOKEN");
console.log("accounts sanity: KIMI_SUB_OAUTH_TOKEN " + (probe ? "PRESENT" : "MISSING"));

const only = process.argv.slice(2);
const ids = [...ctx.providers.ids()].filter((id) => only.length === 0 || only.includes(id));
// explicit model override: --model=provider:model
const modelArg = process.argv.slice(2).find((a) => a.startsWith("--model="));
const modelOverride = modelArg
  ? (() => {
      const s = modelArg.slice(8);
      const i = s.indexOf(":");
      return [s.slice(0, i), s.slice(i + 1)];
    })()
  : null;
/**
 * Attempts to retrieve a model ID for the given ID.
 *
 * Guarantees returning an object with `model` and `via` properties.
 * On failure, returns `model: undefined, via: "none"`.
 *
 * @param {string} id - The ID used to fetch the model.
 * @returns {Promise<{ model: string | undefined, via: string }>} - The model ID and source of discovery.
 */
const firstModel = async (id) => {
  const route = ctx.providers.get(id);
  try {
    const models = await llm.adapter.listModels(id);
    if (models.length > 0) return { model: models[0].id, via: "discovery" };
    if (route?.models?.[0]?.id)
      return { model: route.models[0].id, via: "static (discovery empty — gated?)" };
    return { model: undefined, via: "none" };
  } catch (e) {
    if (route?.models?.[0]?.id)
      return {
        model: route.models[0].id,
        via: "static (discovery: " + String(e?.code ?? e?.message ?? e).slice(0, 60) + ")",
      };
    console.log("  listModels(" + id + ") error: " + String(e?.message ?? e).slice(0, 150));
    return { model: undefined, via: "none" };
  }
};

const results = [];
for (const id of ids) {
  const fm = await firstModel(id);
  const model = modelOverride && modelOverride[0] === id ? modelOverride[1] : fm.model;
  const started = Date.now();
  const row = { provider: id, model, via: fm.via };
  try {
    if (!model) throw new Error("no models (discovery+static both empty)");
    const gate = await ctx.dshProviders.gate(id);
    if (gate?.reason) row.gate = gate.reason.code;
    let text = "";
    const isLocal = ctx.providers.has(id) && ctx.providers.get(id).kind === "local";
    const timeoutMs = isLocal ? 180_000 : 45_000;
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("probe timeout " + timeoutMs / 1000 + "s")), timeoutMs),
    );
    const run = (async () => {
      for await (const chunk of llm.adapter.stream({
        provider: id,
        model,
        messages: [{ role: "user", content: [{ type: "text", text: "Reply with exactly: ok" }] }],
      })) {
        if (chunk?.type === "text" && typeof chunk.text === "string") text += chunk.text;
        else if (typeof chunk?.text === "string") text += chunk.text;
      }
    })();
    await Promise.race([run, timeout]);
    row.status = "OK";
    row.text = text.slice(0, 40);
  } catch (error) {
    row.status = error?.code ?? "ERROR";
    row.error = String(error?.message ?? error).slice(0, 160);
  }
  row.ms = Date.now() - started;
  results.push(row);
  const mark = row.status === "OK" ? "PASS" : "FAIL";
  console.log(
    mark +
      " " +
      id +
      " (" +
      model +
      ", " +
      row.via +
      ") " +
      row.ms +
      "ms" +
      (row.text ? ' — "' + row.text + '"' : "") +
      (row.error ? " — " + row.error : "") +
      (row.gate ? " [gate: " + row.gate + "]" : ""),
  );
}
const ok = results.filter((r) => r.status === "OK").length;
console.log("RESULT " + ok + "/" + results.length + " providers executing");
