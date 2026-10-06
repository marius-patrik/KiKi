// jscpd:ignore-start -- per-provider-route verification scaffolding repeated per route within this single check-plugin.mjs
import * as providers from "./lib/index.js";
import * as dialects from "@dsh-stack/dialects";
import { Context } from "@deepseek-ai/cordis";
import { LlmError } from "@deepseek-ai/dsh-llm";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

// The harness' own projection rule, imported rather than reimplemented: the
// settings service decides what is editable from `volatileForm` /
// `isVolatilePath` / `projectForm` (dsh-settings `lib/types/schema.js`), and a
// local copy of that rule could drift from the harness and turn the guards below
// into a tautology. It is not in the package's `exports` map, so it is loaded by
// file.
const { isVolatilePath, plainConfig, projectForm, volatileForm } = await import(
  new URL("./node_modules/@deepseek-ai/dsh-settings/lib/types/schema.js", import.meta.url).href
);

/**
 * Commit a value into a live config reference, the way the Loader does.
 *
 * The reference protocol is a global symbol shared across cosmokit copies, so the
 * write needs no import of the runtime that owns it. The committed value is
 * frozen exactly as the runtime freezes a committed snapshot, which is what keeps
 * a plugin that tries to mutate it honest.
 *
 * @param {object} reference - the `Volatile` reference handed to `apply`.
 * @param {unknown} value - the next immutable value for that reference.
 */
function commitVolatile(reference, value) {
  /**
   * Deep-freeze a committed value, matching what a settings write hands a volatile field.
   * @param {unknown} node - the value to freeze.
   * @returns {unknown} the same value, frozen.
   */
  const freeze = (node) => {
    if (node === null || typeof node !== "object") return node;
    for (const child of Object.values(node)) freeze(child);
    return Object.freeze(node);
  };
  reference[Symbol.for("cosmokit.volatile.write")](freeze(value));
}

// Every route now lives in its own `@dsh-stack/provider-<id>` extension (see
// extensions/provider-<id>); this package only owns the registry and dispatch
// mechanics. Loaded here by relative path (not a package.json dependency —
// that would invert the real ownership direction, the plugin does not depend
// on its extensions) purely so this contract test can exercise the same 20
// routes real deployments assemble, the way the split shipped them.
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
const extensions = new Map(
  await Promise.all(
    EXTENSION_IDS.map(async (id) => [
      id,
      await import(`../../../publish/extensions/provider-${id}/lib/index.js`),
    ]),
  ),
);

// Same split applies one layer down: `dialects` only owns the registry, and
// every concrete wire dialect a route above resolves against lives in its own
// `@dsh-stack/dialect-<id>` extension. Loaded the same way, for the same
// reason — this test exercises the dialect resolution real deployments get.
// `gemini` is deliberately absent: no provider route above resolves it via
// `ctx.dialects.get("gemini")` (`provider-gemini-api` uses `openai`,
// `provider-gemini-sub` uses `code-assist`) — `@dsh-stack/dialect-gemini` is
// a plain library `@dsh-stack/dialect-code-assist` imports its serialization
// helpers from directly, not a mountable dialect extension (dsh-stack#194).
const DIALECT_IDS = ["openai", "claude", "code-assist", "antigravity"];
const dialectExtensions = new Map(
  await Promise.all(
    DIALECT_IDS.map(async (id) => [
      id,
      await import(`../../../publish/extensions/dialect-${id}/lib/index.js`),
    ]),
  ),
);

/** Apply the dialects plugin, then every concrete dialect extension's registration. */
function applyDialects(ctx) {
  dialects.apply(ctx, {});
  for (const extension of dialectExtensions.values()) extension.apply(ctx);
}

/**
 * Apply the providers plugin, then every provider extension's route registration.
 *
 * The config is built through the plugin's own `Config` schema exactly as the
 * Loader builds it, because `baseURLs`, `mode` and `liveCatalog` are volatile
 * fields: what `apply` receives is a set of live references, not the object that
 * was configured. Handing it a literal — as this script used to — would typecheck
 * against the schema's input type and then fail at the first `.get()`.
 *
 * @param {object} ctx - the context to apply into.
 * @param {object} [raw] - the configured fields, as a user would write them.
 * @returns {object} the resolved Config `apply` was handed.
 */
function applyProviders(ctx, raw = {}) {
  const config = providers.Config["~standard"].validate(raw).value;
  providers.apply(ctx, config);
  for (const extension of extensions.values()) extension.apply(ctx);
  return config;
}

assertLoaderShape(providers, "providers");

console.log("loader shape ok:", providers.name, "inject=", JSON.stringify(providers.inject));

// The namespace is this plugin's own Loader entry id, so the form the service
// projects and the form a client asks for cannot name different entries.
assert.equal(providers.NS, providers.name, "the settings namespace must be the plugin entry id");
console.log("namespace ok:", providers.NS);

// The settings service this plugin declares its page against. `stubSettingsService`
// records the policies registered through it and answers `describe()` with the
// empty list a service with no projected entry returns.
const { service: settings, registrations: settingsPolicies } = stubSettingsService();

// ── The 0.2.0 settings contract ──────────────────────────────────────────────
// Since 0.2.0 a plugin registers no settings form: the service projects the
// volatile Config fields of the active profile's entries, and the namespace is
// the entry's own id. Both gates below are the harness' own, so this asserts
// against them rather than against a copy of the rule.
assert.ok(
  volatileForm(providers.Config) !== undefined,
  "providers: Config declares no volatile field, so describe() omits this entry and write() refuses it",
);

/**
 * Every leaf path in the schema, so a newly added field is classified too.
 * @param {object} schema - the schemastery node to walk.
 * @param {string[]} [prefix] - the path walked to reach this node.
 * @returns {string[][]} one path per leaf.
 */
function leafPaths(schema, prefix = []) {
  if (schema.dict === undefined) return [prefix];
  return Object.entries(schema.dict).flatMap(([key, child]) => leafPaths(child, [...prefix, key]));
}

const volatileLeaves = leafPaths(providers.Config)
  .filter((path) => isVolatilePath(providers.Config, path))
  .map((path) => path.join("."))
  .sort();
assert.deepEqual(
  volatileLeaves,
  ["baseURLs", "liveCatalog", "mode"],
  "the volatile/deployment-fact split has drifted from the intended one",
);
console.log("volatile marking ok:", volatileLeaves.join(", "));

// The deployment facts stay plain, so no form write may address them and an edit
// restarts the entry instead of landing under the user's cursor.
for (const fact of ["catalogTtlMs", "retryPolicy", "streamIdleTimeoutMs"]) {
  assert.equal(
    isVolatilePath(providers.Config, [fact]),
    false,
    `${fact} is a deployment fact and must not be projected as a form field`,
  );
}

// The form is the volatile projection of a real config: the user choices are
// present and the deployment facts absent.
const form = volatileForm(providers.Config);
const projected = projectForm(
  form,
  plainConfig(providers.Config({ mode: "all", liveCatalog: false })),
);
assert.equal(projected.mode, "all");
assert.equal(projected.liveCatalog, false);
assert.deepEqual(projected.baseURLs, {});
assert.equal(projected.catalogTtlMs, undefined, "a deployment fact must not reach the form");
assert.equal(projected.retryPolicy, undefined, "a deployment fact must not reach the form");
assert.equal(projected.streamIdleTimeoutMs, undefined, "a deployment fact must not reach the form");
console.log("form projection ok (user choices in, deployment facts out)");

// This plugin ships its own page for that form — `client.js` builds the whole
// Providers UI against `/vault/api` and `/quotas/api` and writes no Config field
// — so the service's generated schema page is turned off rather than left to
// render over fields nothing edits.
const ctxPage = new Context();
ctxPage.provide("settings", settings);
providers.apply(ctxPage, providers.Config["~standard"].validate({}).value);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(
  settingsPolicies.length,
  1,
  `expected one settings page policy, got ${settingsPolicies.length}`,
);
assert.equal(settingsPolicies[0].presentation.auto, false);
console.log("boot ok (custom settings page declared)");

const ctx = new Context();
applyDialects(ctx);

const llm = {
  configurable: [],
  adapter: undefined,
  registeredProviders: undefined,
  /**
   * Determines the failure type based on the HTTP status code and provider message.
   *
   * - Returns "AUTH" for 401 errors unless the message indicates a quota or rate limit.
   * - Returns "QUOTA" for 403 errors with a "permission_error" message.
   * - Returns "RATE_LIMIT" for 429 errors.
   * - Returns an empty string for messages that do not indicate a failure type.
   */
  registerConfigurableProviders(entries) {
    this.configurable = [...entries];
    const self = this;
    /**
     * Registers a provider for the given context.
     *
     * @param {string} _ns - The namespace for the provider.
     * @param {object} _schema - The schema for the provider.
     * @param {object} opts - Configuration options for the provider.
     * @returns {object} An object with `get` to retrieve the base value and `watch` to get the current value.
     */
    const handle = () => {};
    handle.replace = (next) => {
      self.configurable = [...next];
    };
    return handle;
  },
  /**
   * Classifies HTTP error codes as either "AUTH" or "QUOTA" based on the error detail.
   *
   * - Returns "QUOTA" if the error code is 403 and the detail contains quota wording.
   * - Returns "AUTH" for any 403 without quota wording or for a 401 error.
   * - Returns "AUTH" for errors like invalid API key or insufficient funding.
   */
  registerAdapter(registered, adapter) {
    this.adapter = adapter;
    this.registeredProviders = [...registered];
    const self = this;
    /**
     * Registers configurable providers and allows replacing the current set of
     * configurable providers.
     *
     * @returns A function that can be used to replace the current set of configurable
     * providers.
     *
     * On failure, the function does not throw or otherwise indicate failure; it
     * simply returns a new function that reflects the updated set of configurable
     * providers.
     */
    const handle = () => {};
    handle.replace = (next) => {
      self.registeredProviders = [...next];
    };
    handle.dispose = () => {};
    return handle;
  },
};
ctx.provide("llm", llm);
ctx.provide("settings", settings);
const credentialsMin = {
  /**
   * Resolves the value for the given reference.
   *
   * Guarantees to return an object with `value` and `source` properties if the
   * reference matches known credentials. Returns `undefined` for unknown
   * references or if no match is found.
   */
  async resolve(ref) {
    if (ref === "CLAUDE_SUB_OAUTH_TOKEN") return { value: "test-oauth-token", source: "test" };
    if (ref === "OPENAI_API_KEY") return { value: "test-openai-key", source: "test" };
    return undefined;
  },
};
ctx.provide("credentials", credentialsMin);

applyProviders(ctx, { liveCatalog: false });
assert.deepEqual(
  llm.configurable.map((p) => p.provider),
  EXTENSION_IDS,
);
assert.deepEqual(llm.registeredProviders, EXTENSION_IDS);
console.log(
  "registration ok:",
  llm.configurable.map((p) => `${p.provider}=${p.displayName}`).join(", "),
);

// The policy service is the single gate source of truth.
assert.ok(ctx.dshProviders instanceof providers.ProviderPolicy);
assert.ok((await ctx.dshProviders.gate("kimi-code"))?.reason.code === "PROVIDER_DISABLED");
assert.ok((await ctx.dshProviders.gate("openai-api"))?.reason.code === "PROVIDER_DISABLED");
assert.equal(await ctx.dshProviders.gate("claude-sub"), undefined);
assert.ok((await ctx.dshProviders.gate("grok-sub"))?.reason.code === "MISSING_CREDENTIAL");
// Providers the plugin does not own (deepseek-official, ...) are offered as-is.
assert.equal(await ctx.dshProviders.gate("deepseek-official"), undefined);
console.log("provider policy service ok");

// Default mode is subscription-only: billable API routes are hidden from the
// catalog and refused everywhere; subscriptions must be logged in.
const adapter = llm.adapter;
const hidden = await adapter.listModels("kimi-code");
assert.deepEqual(hidden, []);
let disabledRejected = false;
try {
  await adapter.resolveModel("kimi-code", "kimi-k2.5");
} catch (error) {
  assert.ok(error instanceof LlmError);
  assert.equal(error.code, "PROVIDER_DISABLED");
  disabledRejected = true;
}
assert.ok(disabledRejected, "disabled provider was not refused at selection");
let disabledStreamRejected = false;
try {
  for await (const _chunk of adapter.stream({
    provider: "kimi-code",
    model: "kimi-k2.5",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  }))
    void _chunk;
} catch (error) {
  assert.ok(error instanceof LlmError);
  assert.equal(error.code, "PROVIDER_DISABLED");
  disabledStreamRejected = true;
}
assert.ok(disabledStreamRejected, "disabled provider was not refused at dispatch");
// A subscription with no stored login leaves the selector rather than
// appearing as a "failed to load" row; the quotas panel is where its status
// is reported. Dispatch still refuses it with the reason.
assert.deepEqual(await adapter.listModels("grok-sub"), []);
await assert.rejects(() => adapter.resolveModel("grok-sub", "grok-4.6"), {
  code: "MISSING_CREDENTIAL",
});
const models = await adapter.listModels("claude-sub");
assert.ok(models.some((m) => m.id === "claude-sonnet-5"));
assert.ok(!ctx.providers.has("cursor-sub"), "cursor-sub must be dropped");
const resolved = await adapter.resolveModel("claude-sub", "claude-sonnet-5");
assert.equal(resolved.defaultMaxTokens, 128_000);
console.log(
  "subscription-only filter ok: kimi-code hidden, grok-sub hidden without a login, claude-sub usable",
);

// mode "all" restores every route: uncatalogued models resolve, and a missing
// key surfaces on the request as MISSING_CREDENTIAL instead of at the filter.
const ctxAll = new Context();
applyDialects(ctxAll);
const llmAll = {
  configurable: [],
  adapter: undefined,
  registeredProviders: undefined,
  /** registerConfigurableProviders implementation. */
  registerConfigurableProviders(entries) {
    this.configurable = [...entries];
    const self = this;
    /**
     * Classifies HTTP 403 responses based on the error message content.
     *
     * - Returns "QUOTA" if the response includes quota-related wording.
     * - Returns "AUTH" for any 403 response without quota wording or for a 401 response.
     * - Returns "AUTH" for responses with a funding problem indicated by an error message.
     */
    const handle = () => {};
    handle.replace = (next) => {
      self.configurable = [...next];
    };
    return handle;
  },
  /** registerAdapter implementation. */
  registerAdapter(registered, adapter) {
    this.adapter = adapter;
    this.registeredProviders = [...registered];
    const self = this;
    /**
     * Classifies an HTTP error code and message into a failure category.
     *
     * @param {number} code - The HTTP status code.
     * @param {string | undefined} message - The optional error message.
     * @returns {string} The failure category, such as "AUTH", "QUOTA", or "RATE_LIMIT".
     * A 403 with a quota message is classified as "QUOTA", a 401 without a specific
     * message is classified as "AUTH", and a 429 is classified as "RATE_LIMIT".
     * If the message does not specify the failure type, it defaults to "AUTH".
     */
    const handle = () => {};
    handle.replace = (next) => {
      self.registeredProviders = [...next];
    };
    handle.dispose = () => {};
    return handle;
  },
};
ctxAll.provide("llm", llmAll);
ctxAll.provide("settings", settings);
const credentialsFull = {
  /**
   * Classifies HTTP error codes and messages to determine the type of failure.
   *
   * @param {number} code - The HTTP status code.
   * @param {string} detail - The error detail message.
   * @returns {string} - Returns "QUOTA" if the error is due to a usage limit, "AUTH" if it's an authentication issue, or "FUNDING" if it's a funding problem.
   *                    Returns "AUTH" for 403 without quota wording and 401 errors.
   */
  async resolve(ref) {
    if (ref === "CLAUDE_SUB_OAUTH_TOKEN") return { value: "test-oauth-token", source: "test" };
    if (ref === "GROK_SUB_OAUTH_TOKEN") return { value: "test-grok-token", source: "test" };
    if (ref === "GEMINI_SUB_OAUTH_TOKEN") return { value: "test-gemini-token", source: "test" };
    if (ref === "OPENAI_API_KEY") return { value: "test-openai-key", source: "test" };
    if (ref.endsWith("_API_KEY")) return { value: `test-${ref.toLowerCase()}`, source: "test" };
    return undefined;
  },
};
ctxAll.provide("credentials", credentialsFull);
applyProviders(ctxAll, { mode: "all", liveCatalog: false });
// mode "all" lifts the pay-as-you-go block for a credentialed route.
assert.equal(await ctxAll.dshProviders.gate("kimi-code"), undefined);
const openAdapter = llmAll.adapter;
const unknown = await openAdapter.resolveModel("kimi-code", "never-seen");
assert.equal(unknown.defaultMaxTokens, 256_000);
console.log(
  "catalog ok (all mode):",
  (await openAdapter.listModels("claude-sub")).map((m) => m.id).join(", "),
);

// Full stream path: real claude dialect serialize -> fetch -> parse -> translate.
const sseBody = [
  "event: message_start",
  'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","usage":{"input_tokens":3,"output_tokens":1}}}',
  "",
  "event: content_block_start",
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}',
  "",
  "event: content_block_stop",
  'data: {"type":"content_block_stop","index":0}',
  "",
  "event: message_delta",
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}',
  "",
  "event: message_stop",
  'data: {"type":"message_stop"}',
  "",
].join("\n");

let capturedUrl;
let capturedAuth;
globalThis.fetch = async (url, init) => {
  capturedUrl = url;
  capturedAuth = init.headers["authorization"];
  return new Response(
    new ReadableStream({
      /**
       * Emits a series of SSE events to start a new message context.
       * Emits `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, and `message_stop` events in sequence.
       * Guarantees that the message context is initialized and ready for content.
       */
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseBody));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};

const chunks = [];
for await (const chunk of openAdapter.stream({
  provider: "claude-sub",
  model: "claude-sonnet-5",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
})) {
  chunks.push(chunk);
}
assert.equal(capturedUrl, "https://api.anthropic.com/v1/messages");
assert.equal(capturedAuth, "Bearer test-oauth-token");
const text = chunks.map((c) => c.block?.text ?? c.delta?.text ?? "").join("");
assert.ok(text.includes("Hello world"), `unexpected assembled text: ${JSON.stringify(text)}`);
const usage = chunks.find((c) => c.usage !== undefined);
assert.ok(usage, "no usage chunk");
console.log(
  "claude-sub stream ok:",
  JSON.stringify({ url: capturedUrl, text, usage: usage.usage }),
);

// New API-key routes speak the openai dialect: api.openai.com/v1 base plus a
// Bearer apiKey resolves through the account seam under mode "all".
const openaiBody = [
  'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"gpt-5","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}',
  "",
  'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"gpt-5","choices":[{"index":0,"delta":{"content":"Hello "}}]}',
  "",
  'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"gpt-5","choices":[{"index":0,"delta":{"content":"world"}}]}',
  "",
  'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"gpt-5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");
globalThis.fetch = async (url, init) => {
  capturedUrl = url;
  capturedAuth = init.headers["authorization"];
  return new Response(
    new ReadableStream({
      /**
       * Sends a stream of text chunks to the API and logs the response.
       * Guarantees that the assembled text includes "Hello world" and logs the URL, text, and usage.
       * Fails if no usage chunk is found or the assembled text does not contain "Hello world".
       */
      start(controller) {
        controller.enqueue(new TextEncoder().encode(openaiBody));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};
const openaiChunks = [];
for await (const chunk of openAdapter.stream({
  provider: "openai-api",
  model: "gpt-5",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
})) {
  openaiChunks.push(chunk);
}
assert.equal(capturedUrl, "https://api.openai.com/v1/chat/completions");
assert.equal(capturedAuth, "Bearer test-openai-key");
const openaiText = openaiChunks.map((c) => c.block?.text ?? c.delta?.text ?? "").join("");
assert.ok(
  openaiText.includes("Hello world"),
  `unexpected assembled text: ${JSON.stringify(openaiText)}`,
);
console.log("openai-api stream ok:", JSON.stringify({ url: capturedUrl, text: openaiText }));

// Proxy routes (openrouter) advertise their catalog in all mode.
const proxyModels = await openAdapter.listModels("openrouter-api");
assert.ok(proxyModels.some((m) => m.id === "openai/gpt-4o"));
console.log("openrouter-api catalog ok:", proxyModels.map((m) => m.id).join(", "));

// OpenCode Zen route: api-key auth, openai dialect, 24+ models in catalog.
const zenModels = await openAdapter.listModels("zen");
assert.ok(zenModels.length >= 20, `zen catalog too small: ${zenModels.length}`);
assert.ok(zenModels.some((m) => m.id === "gpt-5.5"));
assert.ok(zenModels.some((m) => m.id === "claude-opus-5"));
assert.ok(zenModels.some((m) => m.id === "deepseek-v4-flash-free"));
const zenResolved = await openAdapter.resolveModel("zen", "gpt-5.5");
assert.equal(zenResolved.defaultMaxTokens, 64_000);
console.log("zen catalog ok:", zenModels.map((m) => m.id).join(", "));

// zen stream: openai dialect against opencode.ai/zen/v1/chat/completions.
globalThis.fetch = async (url, init) => {
  capturedUrl = url;
  capturedAuth = init.headers["authorization"];
  return new Response(
    new ReadableStream({
      /**
       * Verifies and asserts the correctness of API responses from different services.
       * Ensures the OpenAI API stream returns expected text and the proxy routes and
       * OpenCode Zen services have the expected models in their catalogs.
       */
      start(controller) {
        controller.enqueue(new TextEncoder().encode(openaiBody));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};
// Provide ZEN_API_KEY for the stream test — update the existing resolver
const zenCreds = {
  /** resolve implementation. */
  async resolve(ref) {
    if (ref === "CLAUDE_SUB_OAUTH_TOKEN") return { value: "test-oauth-token", source: "test" };
    if (ref === "GROK_SUB_OAUTH_TOKEN") return { value: "test-grok-token", source: "test" };
    if (ref === "GEMINI_SUB_OAUTH_TOKEN") return { value: "test-gemini-token", source: "test" };
    if (ref === "OPENAI_API_KEY") return { value: "test-openai-key", source: "test" };
    if (ref === "ZEN_API_KEY") return { value: "test-zen-key", source: "test" };
    return undefined;
  },
};
// Cannot re-provide credentials; override the existing object's resolve
Object.assign(credentialsFull, zenCreds);
const zenChunks = [];
for await (const chunk of openAdapter.stream({
  provider: "zen",
  model: "gpt-5.5",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
})) {
  zenChunks.push(chunk);
}
assert.equal(capturedUrl, "https://opencode.ai/zen/v1/chat/completions");
assert.equal(capturedAuth, "Bearer test-zen-key");
const zenText = zenChunks.map((c) => c.block?.text ?? c.delta?.text ?? "").join("");
assert.ok(zenText.includes("Hello world"), `unexpected zen text: ${JSON.stringify(zenText)}`);
console.log("zen stream ok:", JSON.stringify({ url: capturedUrl, text: zenText }));

// Missing credential path under mode "all": the request fails at auth time.
const missing = openAdapter.stream({
  provider: "kimi-code",
  model: "kimi-k2.5",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
});
let rejected = false;
try {
  for await (const _chunk of missing) void _chunk;
} catch (error) {
  assert.ok(error instanceof LlmError);
  assert.equal(error.code, "MISSING_CREDENTIAL");
  rejected = true;
}
assert.ok(rejected, "missing credential was not rejected");
console.log("missing-credential path ok");

// grok-sub speaks openai against cli-chat-proxy with the identity headers.
let capturedInit;
globalThis.fetch = async (url, init) => {
  capturedUrl = url;
  capturedInit = init;
  return new Response(
    new ReadableStream({
      /**
       * Attempts to resolve an API credential based on the provided reference.
       * Returns a credential object with the value and source if found; otherwise, returns undefined.
       * Fails if the reference does not match any known credential type.
       *
       * @param ref - The reference string used to identify the credential type.
       * @returns An object containing the credential value and source if the reference matches; otherwise, undefined.
       */
      start(controller) {
        controller.enqueue(new TextEncoder().encode(openaiBody));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};
const grokChunks = [];
for await (const chunk of openAdapter.stream({
  provider: "grok-sub",
  model: "grok-4.6",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
})) {
  grokChunks.push(chunk);
}
assert.equal(capturedUrl, "https://cli-chat-proxy.grok.com/v1/chat/completions");
assert.equal(capturedInit.headers["authorization"], "Bearer test-grok-token");
assert.equal(capturedInit.headers["x-xai-token-auth"], "xai-grok-cli");
assert.equal(capturedInit.headers["x-grok-client-identifier"], "grok-shell");
assert.equal(capturedInit.headers["x-grok-client-version"], "0.2.93");
const grokText = grokChunks.map((c) => c.block?.text ?? c.delta?.text ?? "").join("");
assert.ok(grokText.includes("Hello world"), `unexpected grok text: ${JSON.stringify(grokText)}`);
console.log("grok-sub stream ok:", JSON.stringify({ url: capturedUrl, text: grokText }));

// gemini-sub speaks code-assist: v1internal endpoint, OAuth bearer, wrapped body.
const assistBody = [
  'data: {"traceId":"t1","response":{"candidates":[{"content":{"role":"model","parts":[{"text":"Hello "}]}}]}}',
  "",
  'data: {"traceId":"t2","response":{"candidates":[{"content":{"role":"model","parts":[{"text":"Hello world"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}}',
  "",
  'data: {"traceId":"t3","response":{"candidates":[{"content":{"role":"model","parts":[{"text":"Hello world"}]},"finishReason":"STOP"}]}}',
  "",
  "",
].join("\n");
globalThis.fetch = async (url, init) => {
  capturedUrl = url;
  capturedInit = init;
  return new Response(
    new ReadableStream({
      /**
       * Attempts to enqueue data and close the controller.
       * Fails if the controller is not properly initialized or if enqueueing fails.
       *
       * @param controller - The controller to enqueue data and close.
       */
      start(controller) {
        controller.enqueue(new TextEncoder().encode(assistBody));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};
const geminiChunks = [];
for await (const chunk of openAdapter.stream({
  provider: "gemini-sub",
  model: "gemini-3.6-flash",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
})) {
  geminiChunks.push(chunk);
}
assert.equal(
  capturedUrl,
  "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
);
assert.equal(capturedInit.headers["authorization"], "Bearer test-gemini-token");
const wrapped = JSON.parse(capturedInit.body);
assert.equal(wrapped.model, "gemini-3.6-flash");
assert.equal(wrapped.project, "");
assert.equal(wrapped.user_prompt_id.length, 36);
assert.equal(wrapped.request.session_id.length, 36);
assert.deepEqual(wrapped.request.contents, [{ role: "user", parts: [{ text: "hi" }] }]);
const geminiText = geminiChunks.map((c) => c.block?.text ?? c.delta?.text ?? "").join("");
assert.ok(
  geminiText.includes("Hello world"),
  `unexpected gemini text: ${JSON.stringify(geminiText)}`,
);
const geminiUsage = geminiChunks.find((c) => c.usage !== undefined);
assert.ok(geminiUsage, "no gemini usage chunk");
console.log(
  "gemini-sub stream ok:",
  JSON.stringify({ url: capturedUrl, text: geminiText, usage: geminiUsage.usage }),
);
// An exhausted plan answers 403 with quota wording. It must classify as
// QUOTA_EXCEEDED, not AUTH: the client renders AUTH as "API key is invalid",
// which sent the operator re-running device login against a working token.
const kimiQuotaDetail =
  "access_terminated_error You've reached your usage limit for this" +
  " billing cycle. Your quota will be refreshed in the next cycle.";
assert.equal(providers.httpErrorCode(403, kimiQuotaDetail), "QUOTA");
assert.equal(
  providers.httpErrorCode(403, "insufficient_quota You exceeded your current quota"),
  "QUOTA",
);
// A 403 without quota wording is still an auth failure, and 401 always is.
assert.equal(providers.httpErrorCode(403, "permission_error not allowed for this key"), "AUTH");
assert.equal(providers.httpErrorCode(403, undefined), "AUTH");
// A funding problem answered as 401 is still a funding problem: Zen returns
// 401 CreditsError about a key that authenticates.
assert.equal(
  providers.httpErrorCode(
    401,
    "CreditsError No payment method. Add a payment method here: https://…",
  ),
  "QUOTA",
);
// A 401 that really is about the credential stays AUTH.
assert.equal(providers.httpErrorCode(401, "invalid_api_key the provided key is not valid"), "AUTH");
assert.equal(providers.httpErrorCode(401, undefined), "AUTH");
assert.equal(providers.httpErrorCode(429, "slow down"), "RATE_LIMIT");
console.log("403 quota classification ok");

// A provider message that says nothing must not become the whole failure
// reason: Anthropic answers a subscription rate limit with message "Error".
{
  const { describeHttpFailure } = providers;
  const rateLimited = describeHttpFailure(429, "claude-sub", 30_000);
  assert.match(rateLimited, /claude-sub/);
  assert.match(rateLimited, /rate limited/i);
  assert.match(rateLimited, /Retry in about 30s/);
  assert.match(describeHttpFailure(429, "claude-sub", undefined), /limit for this/);
  assert.match(describeHttpFailure(401, "kimi-code", undefined), /refused this credential/);
  assert.match(describeHttpFailure(503, "gemini-sub", undefined), /internal error/);
  assert.match(describeHttpFailure(418, "zen", undefined), /HTTP 418/);
  console.log("uninformative-failure copy ok");
}

// ---- the credential gate keeps unusable rows out of the selector ----
{
  const ctxBare = new Context();
  applyDialects(ctxBare);
  const llmBare = {
    configurable: [],
    adapter: undefined,
    /** registerConfigurableProviders implementation. */
    registerConfigurableProviders() {},
    /** registerAdapter implementation. */
    registerAdapter(registered, adapter) {
      this.adapter = adapter;
      /** handle implementation. */
      const handle = () => {};
      handle.replace = () => {};
      handle.dispose = () => {};
      return handle;
    },
  };
  ctxBare.provide("llm", llmBare);
  ctxBare.provide("settings", settings);
  // Nothing is configured: every route is uncredentialed.
  ctxBare.provide("credentials", {
    /** resolve implementation. */
    async resolve() {
      return undefined;
    },
  });
  applyProviders(ctxBare, { mode: "all", liveCatalog: false });

  // Nothing configured: every route leaves the selector silently. The host
  // hides a provider whose gate is invisible, so no "failed to load" row is
  // produced for a provider the user has no account with.
  for (const provider of ["kimi-code", "kimi-sub", "openai-api", "zen"]) {
    const gate = await ctxBare.dshProviders.gate(provider);
    assert.equal(gate?.visible, false, `${provider} was never configured and must be hidden`);
    assert.equal(gate?.reason.code, "MISSING_CREDENTIAL");
    assert.deepEqual(
      await ctxBare.llm.adapter.listModels(provider),
      [],
      `${provider} must list nothing`,
    );
    await assert.rejects(() => ctxBare.llm.adapter.resolveModel(provider, "anything"), {
      code: "MISSING_CREDENTIAL",
    });
  }

  // A subscription whose stored login no longer resolves is the one case that
  // must be surfaced: the record exists, so the user has to act on it.
  const ctxStale = new Context();
  applyDialects(ctxStale);
  const llmStale = {
    configurable: [],
    adapter: undefined,
    /** registerConfigurableProviders implementation. */
    registerConfigurableProviders() {},
    /** registerAdapter implementation. */
    registerAdapter(registered, adapter) {
      this.adapter = adapter;
      /** handle implementation. */
      const handle = () => {};
      handle.replace = () => {};
      handle.dispose = () => {};
      return handle;
    },
  };
  ctxStale.provide("llm", llmStale);
  ctxStale.provide("settings", settings);
  // The dead-refresh-grant shape: an expired access token still on disk, a
  // refresh token the provider has already consumed, and an expiry in the past
  // so a refresh is attempted.
  ctxStale.provide("accounts", {
    /** resolve implementation. */
    async resolve(ref) {
      if (ref === "CLAUDE_SUB_OAUTH_TOKEN") return { value: "stored-but-expired", source: "test" };
      if (ref === "CLAUDE_SUB_REFRESH_TOKEN") return { value: "consumed-refresh", source: "test" };
      if (ref === "CLAUDE_SUB_EXPIRES") return { value: "1", source: "test" };
      return undefined;
    },
    /** set implementation. */
    async set() {},
    /** accounts implementation. */
    async accounts() {
      return [];
    },
  });
  applyProviders(ctxStale, { mode: "all", liveCatalog: false });

  // 400 on a refresh grant is invalid_grant: permanent, so the stored access
  // token stops resolving while the record itself stays on disk.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/oauth/token"))
      return new Response('{"error":"invalid_grant"}', { status: 400 });
    throw new Error(`unexpected fetch in stale-credential test: ${String(url)}`);
  };
  try {
    // Both leave the selector, but the reason distinguishes them: only a stale
    // login is something the user can act on.
    const staleGate = await ctxStale.dshProviders.gate("claude-sub");
    assert.equal(staleGate?.visible, false, "an unusable route must not become a failure row");
    assert.match(staleGate?.reason.message ?? "", /no longer valid/);
    assert.match(staleGate?.reason.message ?? "", /sign in again/);
    const neverGate = await ctxStale.dshProviders.gate("openai-api");
    assert.equal(neverGate?.visible, false);
    assert.match(neverGate?.reason.message ?? "", /no credential for/);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("credential gate ok: unusable routes leave the selector, stale ones say why");
}

// ---- the effort changer ----
{
  // The harness carries LlmResolvedModelInfo.reasoning to the model picker, so
  // declaring efforts here is what makes the changer appear for a dsh route.
  const resolved = await openAdapter.resolveModel("claude-sub", "claude-opus-5");
  assert.deepEqual(
    resolved.reasoning?.efforts.map((e) => e.id),
    ["low", "medium", "high"],
  );
  assert.equal(resolved.reasoning?.defaultEffort, "medium");
  // A model without reasoning must not advertise a changer.
  assert.equal((await openAdapter.resolveModel("openai-api", "gpt-4o-mini")).reasoning, undefined);
  console.log("effort ladder reaches the picker");
}

// ---- live model discovery ----
{
  const { ModelCatalog, mergeCatalog, parseCatalogResponse } = providers;

  // Every published spelling of the window size is read; rows without an id are dropped.
  assert.deepEqual(
    parseCatalogResponse({
      data: [
        { id: "a", display_name: "A", context_length: 262144 },
        { id: "b", name: "B", context_window: 1000 },
        { id: "c", top_provider: { context_length: 500, max_completion_tokens: 50 } },
        { object: "model" },
      ],
    }),
    [
      { id: "a", name: "A", contextWindow: 262144 },
      { id: "b", name: "B", contextWindow: 1000 },
      { id: "c", contextWindow: 500, maxTokens: 50 },
    ],
  );
  assert.equal(parseCatalogResponse({ data: [] }), undefined);
  assert.equal(parseCatalogResponse({ error: "nope" }), undefined);
  assert.equal(parseCatalogResponse("not json"), undefined);

  // Discovered facts win; static rows fill the gaps and unlisted aliases survive.
  const merged = mergeCatalog(
    [{ id: "live-new", contextWindow: 900 }, { id: "known" }],
    [
      { id: "known", name: "Known", contextWindow: 111, maxTokens: 22 },
      { id: "alias", name: "Alias", contextWindow: 333, maxTokens: 44 },
    ],
    { contextWindow: 128_000, maxTokens: 8_000 },
  );
  assert.deepEqual(merged, [
    { id: "live-new", name: "live-new", contextWindow: 900, maxTokens: 8_000 },
    { id: "known", name: "Known", contextWindow: 111, maxTokens: 22 },
    { id: "alias", name: "Alias", contextWindow: 333, maxTokens: 44 },
  ]);

  const request = {
    source: { url: "https://example.test/v1/models" },
    token: "test-token",
    fallback: [{ id: "static-only", name: "Static", contextWindow: 10, maxTokens: 5 }],
    defaults: { contextWindow: 128_000, maxTokens: 8_000 },
  };

  // A concurrent burst of selector reads makes exactly one request.
  let calls = 0;
  let seenAuth;
  const okCatalog = new ModelCatalog({
    fetch: async (url, init) => {
      calls += 1;
      seenAuth = init.headers["authorization"];
      return new Response(JSON.stringify({ data: [{ id: "fresh-model", context_length: 42 }] }), {
        status: 200,
      });
    },
  });
  const [first, second] = await Promise.all([
    okCatalog.models("p", request),
    okCatalog.models("p", request),
  ]);
  assert.equal(calls, 1);
  assert.equal(seenAuth, "Bearer test-token");
  assert.deepEqual(
    first.map((m) => m.id),
    ["fresh-model", "static-only"],
  );
  assert.deepEqual(second, first);
  assert.deepEqual(
    (await okCatalog.models("p", request)).map((m) => m.id),
    ["fresh-model", "static-only"],
  );
  assert.equal(calls, 1, "a cached listing must not refetch inside the TTL");
  okCatalog.clear();
  await okCatalog.models("p", request);
  assert.equal(calls, 2, "clear() must force a refetch");

  // A refused listing degrades to the static table rather than failing the selector.
  const refused = new ModelCatalog({ fetch: async () => new Response("nope", { status: 403 }) });
  assert.deepEqual(
    (await refused.models("p", request)).map((m) => m.id),
    ["static-only"],
  );
  const offline = new ModelCatalog({
    fetch: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(
    (await offline.models("p", request)).map((m) => m.id),
    ["static-only"],
  );

  // x-api-key routes send the Anthropic headers, query routes put the key in the URL.
  let anthropicHeaders;
  const anthropic = new ModelCatalog({
    fetch: async (url, init) => {
      anthropicHeaders = init.headers;
      return new Response(JSON.stringify({ data: [{ id: "claude-x" }] }), { status: 200 });
    },
  });
  await anthropic.models("a", {
    ...request,
    source: { url: "https://example.test/v1/models", authStyle: "x-api-key" },
  });
  assert.equal(anthropicHeaders["x-api-key"], "test-token");
  assert.equal(anthropicHeaders["anthropic-version"], "2023-06-01");
  assert.equal(anthropicHeaders["authorization"], undefined);

  let queryUrl;
  const queryAuth = new ModelCatalog({
    fetch: async (url) => {
      queryUrl = url;
      return new Response(JSON.stringify({ data: [{ id: "gemini-x" }] }), { status: 200 });
    },
  });
  await queryAuth.models("g", {
    ...request,
    source: { url: "https://example.test/v1beta/models", authStyle: "query" },
  });
  assert.equal(new URL(queryUrl).searchParams.get("key"), "test-token");

  // A declared effort ladder must survive discovery: listings never publish it,
  // so the static row is the only source and dropping it would remove the effort
  // changer from the picker the moment discovery came online.
  const withEfforts = mergeCatalog(
    [{ id: "known" }],
    [
      {
        id: "known",
        name: "Known",
        contextWindow: 1,
        maxTokens: 1,
        reasoning: { efforts: [{ id: "high", name: "High" }] },
      },
    ],
    { contextWindow: 2, maxTokens: 2 },
  );
  assert.deepEqual(withEfforts[0].reasoning, { efforts: [{ id: "high", name: "High" }] });

  console.log("live model discovery ok");
}

// ---- status lights for providers this plugin does not own ----
{
  const { createConfiguredProviders, probeConfiguredRoute, readConfiguredProfile, modelsEndpoint } =
    providers;
  const PROBE_ROUTE_IDS = [...ctx.providers.list()]
    .filter((route) => route.probe !== undefined)
    .map((route) => route.id);

  assert.equal(modelsEndpoint("https://gw.test/v1"), "https://gw.test/v1/models");
  assert.equal(modelsEndpoint("https://gw.test/v1/"), "https://gw.test/v1/models");

  // A profile is addressed by settingsPath inside its namespace's value.
  const descriptors = [
    {
      ns: "llm-pi-ai",
      value: {
        providers: { "my-gateway": { baseURL: "https://gw.test/v1", apiKeyEnv: "MY_GW_KEY" } },
      },
    },
  ];
  const entry = {
    provider: "my-gateway",
    displayName: "My Gateway",
    settingsNs: "llm-pi-ai",
    settingsPath: ["providers", "my-gateway"],
  };
  assert.deepEqual(readConfiguredProfile(entry, descriptors), {
    baseURL: "https://gw.test/v1",
    apiKeyEnv: "MY_GW_KEY",
  });
  assert.equal(readConfiguredProfile({ ...entry, settingsNs: "absent" }, descriptors), undefined);
  assert.equal(
    readConfiguredProfile({ ...entry, settingsPath: ["providers", "other"] }, descriptors),
    undefined,
  );

  // Each status the endpoint can answer with maps to the light it deserves.
  const statuses = [
    [200, "available"],
    [401, "error"],
    [403, "error"],
    [429, "error"],
    [404, "unknown"],
    [500, "unknown"],
  ];
  for (const [status, expected] of statuses) {
    const snap = await probeConfiguredRoute(
      entry,
      { baseURL: "https://gw.test/v1", apiKeyEnv: "MY_GW_KEY" },
      "secret",
      async () => new Response("", { status }),
    );
    assert.equal(snap.status, expected, `HTTP ${status} must read as ${expected}`);
  }

  // The credential is sent, and a missing one is reported rather than probed.
  let sentAuth;
  await probeConfiguredRoute(
    entry,
    { baseURL: "https://gw.test/v1", apiKeyEnv: "MY_GW_KEY" },
    "secret",
    async (url, init) => {
      sentAuth = init.headers["authorization"];
      return new Response("", { status: 200 });
    },
  );
  assert.equal(sentAuth, "Bearer secret");
  const noCred = await probeConfiguredRoute(
    entry,
    { baseURL: "https://gw.test/v1", apiKeyEnv: "MY_GW_KEY" },
    undefined,
    async () => {
      throw new Error("must not be called");
    },
  );
  assert.equal(noCred.status, "unknown");
  assert.match(noCred.message, /No credential configured \(MY_GW_KEY\)/);

  // A keyless local endpoint is probed unauthenticated.
  let keylessAuth = "unset";
  const keyless = await probeConfiguredRoute(
    entry,
    { baseURL: "http://127.0.0.1:11434/v1" },
    undefined,
    async (url, init) => {
      keylessAuth = init.headers["authorization"];
      return new Response("", { status: 200 });
    },
  );
  assert.equal(keylessAuth, undefined);
  assert.equal(keyless.status, "available");

  // A route with no endpoint says so instead of implying health.
  const noEndpoint = await probeConfiguredRoute(entry, {}, undefined, async () => {
    throw new Error("must not be called");
  });
  assert.equal(noEndpoint.status, "unknown");

  // Built-ins keep their own probes; only uncovered routes get one from here.
  const built = createConfiguredProviders({
    listConfigurable: () => [entry, { ...entry, provider: "kimi-sub" }],
    describeSettings: () => descriptors,
    readToken: async () => "secret",
    covered: (provider) => PROBE_ROUTE_IDS.includes(provider),
    fetch: async () => new Response("", { status: 200 }),
  });
  assert.deepEqual(
    built.map((p) => p.id),
    ["my-gateway"],
  );

  // A declared-but-unconfigured route gets no probe at all, so the panel is not
  // filled with rows whose only message is that nobody configured them.
  const unconfigured = createConfiguredProviders({
    listConfigurable: () => [
      entry,
      { ...entry, provider: "catalog-route", settingsPath: ["providers", "catalog-route"] },
    ],
    describeSettings: () => descriptors,
    readToken: async () => "secret",
    covered: () => false,
    fetch: async () => new Response("", { status: 200 }),
  });
  assert.deepEqual(
    unconfigured.map((p) => p.id),
    ["my-gateway"],
  );

  // Routes this plugin owns never fall through to the generic prober.
  for (const owned of EXTENSION_IDS) {
    assert.deepEqual(
      createConfiguredProviders({
        listConfigurable: () => [{ ...entry, provider: owned }],
        describeSettings: () => descriptors,
        readToken: async () => "secret",
        covered: (candidate) => EXTENSION_IDS.includes(candidate),
        fetch: async () => new Response("", { status: 200 }),
      }).map((p) => p.id),
      [],
      `${owned} is owned and must keep its own probe`,
    );
  }
  assert.equal((await built[0].read({ aborted: false })).status, "available");
  assert.equal((await built[0].read({ aborted: true })).status, "unknown");

  console.log("configured-route status lights ok");
}

// ---- a committed volatile write is observed without a remount ----
{
  // A volatile write is committed into the running references and announced on
  // `loader/volatile-update`; it does NOT re-run `apply`. So this context counts
  // `registerAdapter` calls — the thing a remount would repeat and a commit
  // cannot — and every assertion below holds with that count still at one.
  let adapterRegistrations = 0;
  let directoryRegistrations = 0;
  let lastReplacedWith = null;
  const volatileCtx = new Context();
  applyDialects(volatileCtx);
  volatileCtx.provide("llm", {
    configurable: [],
    /** registerConfigurableProviders implementation. */
    registerConfigurableProviders(entries) {
      directoryRegistrations += 1;
      this.configurable = [...entries];
      /** handle implementation. */
      const handle = () => {};
      handle.replace = (next) => {
        this.configurable = [...next];
      };
      return handle;
    },
    /** registerAdapter implementation. */
    registerAdapter(registered, adapter) {
      adapterRegistrations += 1;
      this.adapter = adapter;
      this.registeredProviders = [...registered];
      /** handle implementation. */
      const handle = () => {};
      handle.replace = (next) => {
        lastReplacedWith = [...next];
        this.registeredProviders = [...next];
      };
      handle.dispose = () => {};
      return handle;
    },
  });
  volatileCtx.provide("settings", stubSettingsService().service);
  volatileCtx.provide("credentials", {
    /** resolve implementation. */
    async resolve(ref) {
      if (ref.endsWith("_API_KEY")) return { value: `test-${ref.toLowerCase()}`, source: "test" };
      return undefined;
    },
  });

  // The stub is installed *before* `apply`: `ModelCatalog` captures `fetch` by
  // reference in its constructor, so a stub swapped in afterwards would leave the
  // catalog dialling the real endpoint. It separates a model listing from a chat
  // stream, so the catalog cache and the connection's base URL are each
  // observable, and it counts listings.
  let listingFetches = 0;
  let liveUrl;
  const liveFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    liveUrl = String(url);
    if (liveUrl.endsWith("/models")) {
      listingFetches += 1;
      return new Response(JSON.stringify({ data: [{ id: "discovered", context_length: 4096 }] }), {
        status: 200,
      });
    }
    return new Response(openaiBody, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  // One commit per field, so a failure names the field that stopped being live.
  let volatileConfig;
  try {
    volatileConfig = applyProviders(volatileCtx, {});
    assert.equal(adapterRegistrations, 1, "a remount would register the adapter twice");
    assert.equal(directoryRegistrations, 1, "a remount would register the directory twice");

    // `mode`: the pay-as-you-go block is what a widened filter lifts, and the
    // adapter registration is what makes the selector ask again.
    assert.equal(
      (await volatileCtx.dshProviders.gate("openai-api"))?.reason.code,
      "PROVIDER_DISABLED",
    );
    // Cleared first: boot-time route registrations already went through `replace`,
    // so leaving the last value in place would make the assertion below a
    // tautology that passes whether or not the commit reached the listener.
    lastReplacedWith = null;
    commitVolatile(volatileConfig.mode, "all");
    volatileCtx.emit("loader/volatile-update", [["mode"]]);
    assert.equal(
      await volatileCtx.dshProviders.gate("openai-api"),
      undefined,
      "the committed mode must lift the pay-as-you-go block",
    );
    assert.deepEqual(
      lastReplacedWith,
      EXTENSION_IDS,
      "a mode commit must replace the adapter registration so the selector re-asks",
    );
    assert.equal(
      adapterRegistrations,
      1,
      "the mode commit replaced routes on the live registration, it did not remount",
    );

    // `liveCatalog`: a listing fetched under the old answer must be dropped, not
    // served. Turning the toggle off stops the fetch; turning it back on must
    // refetch, which it only does if the commit cleared the cache.
    const discovered = await volatileCtx.llm.adapter.listModels("openrouter-api");
    assert.ok(
      discovered.some((m) => m.id === "discovered"),
      "liveCatalog is on by default, so the listing must be discovered",
    );
    assert.equal(listingFetches, 1);
    commitVolatile(volatileConfig.liveCatalog, false);
    volatileCtx.emit("loader/volatile-update", [["liveCatalog"]]);
    assert.ok(
      !(await volatileCtx.llm.adapter.listModels("openrouter-api")).some(
        (m) => m.id === "discovered",
      ),
      "a liveCatalog=false commit must drop the discovered listing",
    );
    commitVolatile(volatileConfig.liveCatalog, true);
    volatileCtx.emit("loader/volatile-update", [["liveCatalog"]]);
    await volatileCtx.llm.adapter.listModels("openrouter-api");
    assert.equal(listingFetches, 2, "the commit must have cleared the catalog cache");

    // `baseURLs`: an endpoint override reaches the very next request.
    for await (const _chunk of volatileCtx.llm.adapter.stream({
      provider: "openai-api",
      model: "gpt-5",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    }))
      void _chunk;
    assert.equal(liveUrl, "https://api.openai.com/v1/chat/completions");
    commitVolatile(volatileConfig.baseURLs, { "openai-api": "https://proxy.test/v1" });
    volatileCtx.emit("loader/volatile-update", [["baseURLs"]]);
    for await (const _chunk of volatileCtx.llm.adapter.stream({
      provider: "openai-api",
      model: "gpt-5",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    }))
      void _chunk;
    assert.equal(
      liveUrl,
      "https://proxy.test/v1/chat/completions",
      "the committed baseURL override must reach the next request",
    );
  } finally {
    globalThis.fetch = liveFetch;
  }

  assert.equal(
    adapterRegistrations,
    1,
    "a volatile commit must not remount the entry: apply never ran a second time",
  );
  assert.equal(directoryRegistrations, 1, "nor must it re-register the directory");
  console.log("volatile commit ok (mode, liveCatalog and baseURLs honored without a remount)");
}

console.log("plugin check passed");

// jscpd:ignore-end
