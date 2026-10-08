import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { Context } from "@deepseek-ai/cordis";
import * as dialects from "@dsh-stack/dialects";
import { DialectAdapter } from "./lib/adapter.js";
import { ModelCatalog } from "./lib/catalog.js";
import * as zenExtension from "../provider-zen/lib/index.js";
const dir = "/Users/user/.agents/vault",
  SEP = String.fromCharCode(31);
const key = Buffer.from(readFileSync(`${dir}/master.key`, "utf8").trim(), "base64");
const /** read implementation. */
  read = (id) => {
    const e = JSON.parse(readFileSync(`${dir}/${id}.vault`, "utf8"));
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
    d.setAAD(Buffer.from(`${e.id}${SEP}${e.type}`, "utf8"));
    d.setAuthTag(Buffer.from(e.authTag, "base64"));
    const r = JSON.parse(d.update(e.ciphertext, "base64", "utf8") + d.final("utf8"));
    return r.material.accessToken ?? r.material.apiKey;
  };
const ctx = new Context();
dialects.apply(ctx, {});
const route = zenExtension.route;
const conn = {
  displayName: route.displayName,
  dialectId: route.dialect,
  baseURL: route.baseURL,
  headers: route.headers,
  authSlots: route.authSlots,
  models: route.models,
  defaultMaxTokens: route.defaultMaxTokens,
  defaultContextWindow: route.defaultContextWindow,
  streamIdleTimeoutMs: 90000,
  retryPolicy: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1, multiplier: 1, jitter: 0 },
  catalog: route.catalog,
};
const a = new DialectAdapter({
  getDialect: (i) => ctx.dialects.get(i),
  options: () => conn,
  resolveAuth: async () => ({ apiKey: read("zen-api-key") }),
  gate: async () => undefined,
  resolveUserId: () => "v",
  catalog: new ModelCatalog(),
});
console.log("zen catalog (live):", (await a.listModels("zen")).length, "models");
for (let i = 1; i <= 8; i++) {
  try {
    let text = "";
    for await (const c of a.stream({
      provider: "zen",
      model: "deepseek-v4-flash-free",
      maxTokens: 512,
      messages: [
        { role: "user", content: [{ type: "text", text: "reply with exactly: working" }] },
      ],
    }))
      if (c.type === "text-delta") text += c.text;
    console.log(
      `zen / deepseek-v4-flash-free  OK  ${JSON.stringify(text.trim().slice(0, 24))} (attempt ${i})`,
    );
    break;
  } catch (e) {
    if (i === 8) {
      console.log("zen ", e.code, String(e.message).slice(0, 60));
    } else await new Promise((r) => setTimeout(r, 25000));
  }
}
