// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages

import assert from "node:assert";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import YAML from "yaml";

const {
  findHarnessDir,
  WEB_PROFILE_BUNDLE,
  readTweaks,
  resolveHome,
  migrateHome,
  parseBoundPort,
  parseLaunchToken,
  readProfilePort,
  resolvePort,
  startPortHint,
  route,
  parseLogsArgs,
  parseAttachArgs,
  readLogTail,
  parsePluginInventory,
  summarizePluginMetrics,
  formatPluginMetricsLine,
  readBrowserSessionSecret,
  browserSessionCookieHeader,
  loadCredentialEnv,
  ensureHeadlessProfile,
  ensureProfileComposition,
  normalizeCustomProviders,
  parseWorktreeList,
  decidePrune,
} = await import("./lib/index.js");

const root = mkdtempSync(join(tmpdir(), "launcher-"));

// readTweaks: section parsing, quote stripping, boundaries, missing file.
const homeA = join(root, "home-a");
mkdirSync(homeA, { recursive: true });
writeFileSync(
  join(homeA, "settings.yaml"),
  [
    "ui-theme:",
    "  preference: dark",
    "tweaks:",
    `  homeRoot: "${join(root, "home-b")}"`,
    "  command: 'status --json'",
    "permission:",
    "  defaultPreset: danger-full-access",
    "",
  ].join("\n"),
);
const tweaks = readTweaks(join(homeA, "settings.yaml"));
assert.equal(tweaks.homeRoot, join(root, "home-b"));
assert.equal(tweaks.command, "status --json");
assert.deepEqual(readTweaks(join(root, "missing.yaml")), {});
const homePlain = join(root, "home-plain");
mkdirSync(homePlain, { recursive: true });
writeFileSync(join(homePlain, "settings.yaml"), "tweaks:\n  other: value\n");
assert.deepEqual(readTweaks(join(homePlain, "settings.yaml")), {});

// The legacy `dsh-tweaks` key is migrated to the canonical `tweaks` key on read.
// This has to happen here rather than in the plugin's mirror because homeRoot is
// consumed before any plugin exists, so a home stored under the legacy key would
// already be lost by the time a plugin could move it. The rename is completed, not
// dual-read: the legacy key is gone from the document afterwards.
const legacyHome = join(root, "home-legacy");
mkdirSync(legacyHome, { recursive: true });
const legacyPath = join(legacyHome, "settings.yaml");
writeFileSync(
  legacyPath,
  [
    "ui-theme:",
    "  preference: dark",
    "dsh-tweaks:",
    "  homeRoot: /legacy/home",
    "  command: stop",
    "",
  ].join("\n"),
);
const migrated = readTweaks(legacyPath);
assert.equal(migrated.homeRoot, "/legacy/home", "a legacy homeRoot must still resolve");
assert.equal(migrated.command, "stop");
const afterMigration = YAML.parse(readFileSync(legacyPath, "utf8"));
assert.equal(
  afterMigration.tweaks.homeRoot,
  "/legacy/home",
  "the section must be under the canonical key",
);
assert.equal(
  Object.hasOwn(afterMigration, "dsh-tweaks"),
  false,
  "the legacy key must be gone, not merely shadowed",
);
assert.equal(
  afterMigration["ui-theme"].preference,
  "dark",
  "other sections must survive the rewrite",
);
// A document already on the canonical key is left byte-identical, so this is not a
// standing rewrite of every settings.yaml on every launch.
const canonicalPath = join(homeA, "settings.yaml");
const before = readFileSync(canonicalPath, "utf8");
readTweaks(canonicalPath);
assert.equal(
  readFileSync(canonicalPath, "utf8"),
  before,
  "a canonical document must not be rewritten",
);
console.log("readTweaks ok");

// resolveHome: DSH_HOME wins, else ~/.agents default.
assert.equal(resolveHome({ DSH_HOME: "/tmp/custom-home" }), "/tmp/custom-home");
assert.ok(resolveHome({}).endsWith(join(".agents")));
console.log("resolveHome ok");

// migrateHome: non-destructive copy of dirs and files, effective home swap.
mkdirSync(join(homeA, "profiles", "web"), { recursive: true });
writeFileSync(join(homeA, "profiles", "web", "cordis.patch.yml"), "- id: webserver\n");
mkdirSync(join(homeA, "sessions"), { recursive: true });
writeFileSync(join(homeA, "accounts.vault"), "vault-bytes");
const homeB = join(root, "home-b");
mkdirSync(join(homeB, "sessions"), { recursive: true });
writeFileSync(join(homeB, "sessions", "keep.txt"), "dest-wins");
writeFileSync(join(homeA, "sessions", "keep.txt"), "source-loses");
const notices = [];
const effective = migrateHome(homeA, homeB, (msg) => notices.push(msg));
assert.equal(effective, homeB);
assert.equal(notices.length, 1);
assert.ok(notices[0].includes("tweaks.homeRoot moved state"));
assert.equal(
  readLogTail(join(homeB, "profiles", "web", "cordis.patch.yml"), 5),
  "- id: webserver\n",
);
assert.equal(readLogTail(join(homeB, "accounts.vault"), 5), "vault-bytes\n");
assert.equal(readLogTail(join(homeB, "sessions", "keep.txt"), 5), "dest-wins\n");
// Same root or empty homeRoot: no move.
assert.equal(
  migrateHome(homeA, homeA, () => {}),
  homeA,
);
assert.equal(
  migrateHome(homeA, "", () => {}),
  homeA,
);
console.log("migrateHome ok");

// parseBoundPort: last dsh-web line wins, junk tolerated.
assert.equal(parseBoundPort("boot\ndsh web: http://127.0.0.1:3081\nready"), 3081);
assert.equal(
  parseBoundPort("dsh web: http://127.0.0.1:3080\ndsh web: http://0.0.0.0:3081\n"),
  3081,
);
assert.equal(parseBoundPort("nothing bound yet"), null);
assert.equal(parseBoundPort("dsh web: http://127.0.0.1:99999"), null);
console.log("parseBoundPort ok");

// parseBoundPort: dsh gateway line (the real API/proxy port) always wins over
// the harness's own dsh-web line (the web-asset port), regardless of order.
assert.equal(
  parseBoundPort("dsh web: http://127.0.0.1:3081\ndsh gateway: http://127.0.0.1:3080\n"),
  3080,
);
assert.equal(
  parseBoundPort("dsh gateway: http://127.0.0.1:3080\ndsh web: http://127.0.0.1:3081\n"),
  3080,
);
assert.equal(
  parseBoundPort("dsh gateway: http://127.0.0.1:3080\ndsh gateway: http://127.0.0.1:3082\n"),
  3082,
);
console.log("parseBoundPort gateway-line precedence ok");

// parseLaunchToken: last dsh-web line WITH a token wins, a token-less dsh-web
// line (the pre-auth boot announcement some harness pins also print) is
// ignored, and a restart's later token supersedes an earlier one.
assert.equal(parseLaunchToken("dsh web: http://127.0.0.1:3081\n"), null);
assert.equal(
  parseLaunchToken(
    "dsh web: http://127.0.0.1:3081\ndsh web: http://127.0.0.1:3081/?token=abc-123_XYZ\n",
  ),
  "abc-123_XYZ",
);
assert.equal(
  parseLaunchToken(
    "dsh web: http://127.0.0.1:3081/?token=first-token\ndsh web: http://127.0.0.1:3081/?token=second-token\n",
  ),
  "second-token",
);
assert.equal(parseLaunchToken("nothing bound yet"), null);
console.log("parseLaunchToken ok");

// readProfilePort: webserver entry of the profile patch.
mkdirSync(join(homeB, "profiles", "web"), { recursive: true });
writeFileSync(
  join(homeB, "profiles", "web", "cordis.patch.yml"),
  [
    "- id: ui-sidebar",
    "  disabled: true",
    "- id: webserver",
    "  config:",
    "    host: '127.0.0.1'",
    "    port: 3081",
    "- id: hosts",
    "  config:",
    "    gatewayPort: 3080",
    "",
  ].join("\n"),
);
assert.equal(readProfilePort(homeB, "web"), 3081);
assert.equal(readProfilePort(homeB, "headless"), null);
mkdirSync(join(homeB, "profiles", "bare"), { recursive: true });
writeFileSync(
  join(homeB, "profiles", "bare", "cordis.patch.yml"),
  "- id: ui-sidebar\n  disabled: true\n",
);
assert.equal(readProfilePort(homeB, "bare"), null);
console.log("readProfilePort ok");

// resolvePort precedence: profile patch > last bound log line > default.
const logFile = join(root, "dsh-web.log");
writeFileSync(logFile, "dsh web: http://127.0.0.1:3080\n");
assert.equal(resolvePort(homeB, "web", logFile), 3081);
assert.equal(resolvePort(homeB, "bare", logFile), 3080);
rmSync(logFile);
assert.equal(resolvePort(homeB, "bare", logFile), 3080);
assert.equal(startPortHint(homeB, "web"), 3081);
assert.equal(startPortHint(homeB, "headless"), 3080);
console.log("resolvePort/startPortHint ok");

// resolvePort: a dsh gateway line in the log is runtime truth about the port
// external consumers actually reach, so it wins even over a pinned profile
// port (dsh-stack#182). A plain dsh-web line still defers to the profile pin.
const gatewayLogFile = join(root, "dsh-gateway.log");
writeFileSync(
  gatewayLogFile,
  "dsh web: http://127.0.0.1:3090\ndsh gateway: http://127.0.0.1:3080\n",
);
assert.equal(resolvePort(homeB, "web", gatewayLogFile), 3080);
writeFileSync(gatewayLogFile, "dsh gateway: http://127.0.0.1:3080\n");
assert.equal(resolvePort(homeB, "web", gatewayLogFile), 3080);
rmSync(gatewayLogFile);
console.log("resolvePort gateway-line-over-pin ok");

// route: lifecycle, logs, package verbs, passthrough, dsh-restart alias,
// dsh-tweaks.command default.
assert.deepEqual(route(["restart"], { invokedName: "dsh" }), {
  kind: "lifecycle",
  action: "restart",
});
assert.deepEqual(route([], { invokedName: "dsh-restart" }), {
  kind: "lifecycle",
  action: "restart",
});
assert.deepEqual(route(["logs", "-f"], { invokedName: "dsh" }), {
  kind: "logs",
  follow: true,
  lines: 50,
});
assert.deepEqual(route(["log", "-n", "10"], { invokedName: "dsh" }), {
  kind: "logs",
  follow: false,
  lines: 10,
});
assert.deepEqual(route(["accounts", "list"], { invokedName: "dsh" }), {
  kind: "verb",
  verb: "accounts",
  args: ["list"],
});
assert.deepEqual(route(["prune-worktrees"], { invokedName: "dsh" }), {
  kind: "prune-worktrees",
});
assert.deepEqual(route(["plugin", "list"], { invokedName: "dsh" }), {
  kind: "passthrough",
  args: ["plugin", "list"],
});
assert.deepEqual(route([], { invokedName: "dsh", command: "status --json" }), {
  kind: "lifecycle",
  action: "status",
});
assert.deepEqual(route([], { invokedName: "dsh", command: "plugin list" }), {
  kind: "passthrough",
  args: ["plugin", "list"],
});
assert.deepEqual(route(["attach"], { invokedName: "dsh" }), {
  kind: "attach",
  lines: 50,
  intervalMs: 5000,
});
assert.deepEqual(route(["attach", "-n", "10", "--interval", "2"], { invokedName: "dsh" }), {
  kind: "attach",
  lines: 10,
  intervalMs: 2000,
});
assert.deepEqual(route([], { invokedName: "dsh", command: "attach -i 1" }), {
  kind: "attach",
  lines: 50,
  intervalMs: 1000,
});
console.log("route ok");

// parseAttachArgs: backlog shared with logs, interval in seconds, junk ignored.
assert.deepEqual(parseAttachArgs([]), { lines: 50, intervalMs: 5000 });
assert.deepEqual(parseAttachArgs(["-i", "0.5"]), { lines: 50, intervalMs: 500 });
assert.deepEqual(parseAttachArgs(["-f", "-n", "5"]), { lines: 5, intervalMs: 5000 });
assert.deepEqual(parseAttachArgs(["-i", "0"]), { lines: 50, intervalMs: 5000 });
assert.deepEqual(parseAttachArgs(["-i", "nope", "--wat"]), { lines: 50, intervalMs: 5000 });
console.log("parseAttachArgs ok");

// parsePluginInventory: a real-shaped RPC payload, and every unusable body.
const inventoryPayload = {
  type: "server-response",
  rpcId: "status",
  result: {
    ok: true,
    value: {
      entries: [
        { entryId: "webserver", moduleName: "@deepseek-ai/dsh-webserver", fiberPhase: "active" },
        { entryId: "ui-sidebar", moduleName: "@dsh-stack/ui-sidebar", fiberPhase: "active" },
        { entryId: "lsp", moduleName: "@dsh-stack/lsp", fiberPhase: "failed" },
        { entryId: "hosts", moduleName: "@dsh-stack/hosts", fiberPhase: "pending" },
        { entryId: "tool-bash", moduleName: "@deepseek-ai/dsh-tool-bash", fiberPhase: null },
      ],
    },
  },
};
const entries = parsePluginInventory(inventoryPayload);
assert.equal(entries.length, 5);
assert.equal(entries[2].entryId, "lsp");
assert.equal(parsePluginInventory({ result: { ok: false, value: { entries: [] } } }), null);
assert.equal(parsePluginInventory({ result: { ok: true, value: {} } }), null);
assert.equal(parsePluginInventory({ error: "boom" }), null);
assert.equal(parsePluginInventory(null), null);
assert.equal(parsePluginInventory("not json"), null);
console.log("parsePluginInventory ok");

// summarizePluginMetrics/formatPluginMetricsLine: counts and the banner.
const metrics = summarizePluginMetrics(entries);
assert.equal(metrics.total, 5);
assert.equal(metrics.active, 2);
assert.equal(metrics.notMounted, 1);
assert.deepEqual(
  metrics.pending.map((entry) => entry.entryId),
  ["hosts"],
);
assert.deepEqual(
  metrics.failed.map((entry) => entry.entryId),
  ["lsp"],
);
assert.deepEqual(summarizePluginMetrics([]), {
  total: 0,
  active: 0,
  pending: [],
  notMounted: 0,
  failed: [],
});
const at = new Date(2026, 0, 2, 3, 4, 5);
assert.equal(
  formatPluginMetricsLine(metrics, at),
  "── 03:04:05 · plugins: 2 active · 1 pending · 1 not mounted · 1 failed ──",
);
assert.equal(formatPluginMetricsLine(null, at), "── 03:04:05 · plugins: server not answering ──");
console.log("plugin metrics ok");

// parseLogsArgs and readLogTail edge cases.
assert.deepEqual(parseLogsArgs([]), { follow: false, lines: 50 });
assert.deepEqual(parseLogsArgs(["--follow", "-n", "5"]), { follow: true, lines: 5 });
writeFileSync(logFile, "l1\nl2\nl3\n");
assert.equal(readLogTail(logFile, 2), "l2\nl3\n");
assert.equal(readLogTail(logFile, 50), "l1\nl2\nl3\n");
assert.equal(readLogTail(join(root, "nope.log"), 50), null);
console.log("logs helpers ok");

// readBrowserSessionSecret + browserSessionCookieHeader: read the same
// on-disk shape harness's dsh-credentials-local writes, and mint a cookie an
// independent reimplementation of browser-auth.ts's own verification logic
// (HMAC-SHA256 over base64url JSON, matching cookie name) accepts.
/** Base64url-encode, matching browser-session-cookie.ts's own encoder. */
function encodeBase64Url(value) {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
/**
 * Verifies a minted cookie against an independent reimplementation of
 * harness's browser-auth.ts decode/HMAC-check logic, so this test proves the
 * cookie is actually acceptable rather than just round-tripping the
 * package's own encoder against itself.
 */
function independentlyVerifyCookie(cookieHeader, secret, authority) {
  const eq = cookieHeader.indexOf("=");
  const name = cookieHeader.slice(0, eq);
  const value = cookieHeader.slice(eq + 1);
  const expectedName =
    "dsh-auth-" + encodeBase64Url(createHash("sha256").update(authority).digest());
  assert.equal(name, expectedName, "cookie name must be dsh-auth-<sha256(authority)>");
  const [version, body, signature] = value.split(".");
  assert.equal(version, "v1");
  const expectedSignature = encodeBase64Url(createHmac("sha256", secret).update(body).digest());
  assert.equal(signature, expectedSignature, "HMAC signature must verify against the secret");
  const payload = JSON.parse(
    Buffer.from(body.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8"),
  );
  assert.equal(payload.version, 1);
  assert.equal(payload.authority, authority);
  assert.ok(payload.expiresAt > payload.issuedAt);
  return payload;
}

const authHome = join(root, "auth-home");
mkdirSync(authHome, { recursive: true });
const realSecretBytes = randomBytes(32);
const realSecret = encodeBase64Url(realSecretBytes);
writeFileSync(
  join(authHome, ".credentials.yaml"),
  [
    "version: 1",
    "refs: {}",
    "records:",
    "  client-connection/browser-session:",
    "    kind: grant",
    "    payload:",
    "      version: 1",
    `      secret: ${realSecret}`,
    "",
  ].join("\n"),
);
const readSecret = await readBrowserSessionSecret(authHome);
assert.ok(readSecret !== undefined, "secret must be read from a well-formed credentials file");
assert.ok(readSecret.equals(realSecretBytes), "read secret must round-trip exactly");
const cookie = browserSessionCookieHeader(readSecret, "127.0.0.1:3080");
independentlyVerifyCookie(cookie, realSecretBytes, "127.0.0.1:3080");

// Missing file, missing record, and wrong-shaped record all degrade to
// undefined rather than throwing.
assert.equal(await readBrowserSessionSecret(join(root, "nope-home")), undefined);
const emptyHome = join(root, "empty-home");
mkdirSync(emptyHome, { recursive: true });
writeFileSync(join(emptyHome, ".credentials.yaml"), "version: 1\nrefs: {}\nrecords: {}\n");
assert.equal(await readBrowserSessionSecret(emptyHome), undefined);
const wrongVersionHome = join(root, "wrong-version-home");
mkdirSync(wrongVersionHome, { recursive: true });
writeFileSync(
  join(wrongVersionHome, ".credentials.yaml"),
  [
    "version: 1",
    "refs: {}",
    "records:",
    "  client-connection/browser-session:",
    "    kind: grant",
    "    payload:",
    "      version: 2",
    `      secret: ${realSecret}`,
    "",
  ].join("\n"),
);
assert.equal(await readBrowserSessionSecret(wrongVersionHome), undefined);
console.log(
  "browser-session cookie ok (secret round-trip, independent HMAC verification, degrade-to-undefined)",
);

// loadCredentialEnv: populate refs into env, non-overwrite, missing file handling.
const testEnv = { EXISTING_KEY: "existing-value" };
const credsFile = join(authHome, ".credentials.yaml");
writeFileSync(
  credsFile,
  [
    "version: 1",
    "refs:",
    "  EXISTING_KEY: new-value",
    "  LOADED_KEY: loaded-value",
    "records: {}",
  ].join("\n"),
);
loadCredentialEnv(credsFile, testEnv);
assert.equal(testEnv.EXISTING_KEY, "existing-value", "existing env key must not be overwritten");
assert.equal(testEnv.LOADED_KEY, "loaded-value", "missing env key must be loaded from refs");
loadCredentialEnv(join(root, "non-existent-creds.yaml"), testEnv);
assert.equal(testEnv.LOADED_KEY, "loaded-value");
console.log("loadCredentialEnv ok");

// normalizeCustomProviders: aligns mistral-conversations and google-generative-ai.
const rawProviders = [
  { id: "p1", api: "openai-completions", baseURL: "https://example.com/v1" },
  { id: "p2", api: "mistral-conversations" },
  { id: "p3", api: "google-generative-ai" },
];
const normalized = normalizeCustomProviders(rawProviders);
assert.equal(normalized[0].api, "openai-completions");
assert.equal(normalized[1].api, "openai-completions");
assert.equal(normalized[1].baseURL, "https://api.mistral.ai/v1");
assert.equal(normalized[2].api, "openai-completions");
assert.equal(normalized[2].baseURL, "https://generativelanguage.googleapis.com/v1beta/openai/");
console.log("normalizeCustomProviders ok");

// ensureHeadlessProfile: package.json, symlinks, cordis.patch.yml.
const headlessHome = join(root, "headless-home");
mkdirSync(headlessHome, { recursive: true });
writeFileSync(
  join(headlessHome, "settings.yaml"),
  [
    "providers:",
    "  custom:",
    "    - id: test-provider",
    "      name: Test Provider",
    "      api: openai-completions",
    "      baseURL: https://test.api/v1",
  ].join("\n"),
);
const pkgDir = join(import.meta.dirname ?? ".");
// CHECK_HARNESS_UNREADABLE=1 points the launcher at a harness that is not there,
// which is the shape of the verify job: that job checks out the submodule but
// never installs it, so the shipped template is unreadable there. Running the
// suite both ways keeps the refusal path covered without a second CI job.
const harnessDir =
  process.env.CHECK_HARNESS_UNREADABLE === "1"
    ? join(pkgDir, "..", "no-such-harness")
    : findHarnessDir(process.env, pkgDir);
if (harnessDir === null)
  throw new Error("this check needs a harness checkout next to the launcher");

// Provisioning a profile from nothing has two acceptable outcomes: it carries the
// harness' shipped rows, or it refuses because that template is unreadable.
// Writing a Stack-only manifest is the one unacceptable outcome: such a profile
// mounts, exits 0, and never serves a request. Which of the two acceptable ones
// happens depends on whether the harness is installed where the launcher looks
// for it -- the verify job does not install it, the browser job does -- so both
// are asserted here rather than only the seeded one.
/**
 * Run a provisioning step, requiring that it either succeeds or refuses outright.
 *
 * @param run - the provisioning call to make.
 * @param label - the profile being provisioned, for the failure message.
 * @returns true when the profile was provisioned.
 */
async function provisionOrRefuse(run, label) {
  try {
    await run();
    return true;
  } catch (error) {
    assert.match(
      String(error?.message ?? error),
      /refusing to provision a profile/,
      `${label}: provisioning may only fail by refusing, never by writing a partial profile`,
    );
    return false;
  }
}
const headlessProvisioned = await provisionOrRefuse(
  () => ensureHeadlessProfile({ home: headlessHome, pkgDir, harnessDir }),
  "headless",
);
if (headlessProvisioned) {
  const headlessPkgJson = JSON.parse(
    readFileSync(join(headlessHome, "profiles", "headless", "package.json"), "utf8"),
  );
  assert.equal(headlessPkgJson.dependencies["@dsh-stack/bundle-headless"], "^0.1.0");
  assert.ok(headlessPkgJson.dsh.profile.bundles.includes("@dsh-stack/bundle-headless"));
  const headlessPatch = YAML.parse(
    readFileSync(join(headlessHome, "profiles", "headless", "cordis.patch.yml"), "utf8"),
  );
  assert.ok(Array.isArray(headlessPatch));
  const piAiEntry = headlessPatch.find((entry) => entry.id === "llm-pi-ai");
  assert.ok(piAiEntry !== undefined);
  assert.equal(piAiEntry.config.providers[0].id, "test-provider");
} else {
  // A refusal must leave no half-written profile behind.
  assert.equal(
    existsSync(join(headlessHome, "profiles", "headless", "package.json")),
    false,
    "a refused profile must not be left with a manifest",
  );
}
console.log("ensureHeadlessProfile ok");

// ensureProfileComposition: a non-headless profile gets the same composition, and a
// workspace manifest left by the retired package manager is removed rather than left
// to redirect resolution. The web profile is the launcher's default, so a provisioning
// step that only covers headless leaves a default boot with no Stack bundle mounted.
const webHome = join(root, "web-home");
const webProfileDir = join(webHome, "profiles", "web");
mkdirSync(webProfileDir, { recursive: true });
writeFileSync(join(webProfileDir, "pnpm-workspace.yaml"), "packages:\n  - .\n");
const webProvisioned = await provisionOrRefuse(
  () =>
    ensureProfileComposition({
      home: webHome,
      pkgDir,
      profile: "web",
      bundle: WEB_PROFILE_BUNDLE,
      harnessDir,
    }),
  "web",
);
if (webProvisioned) {
  const webPkgJson = JSON.parse(readFileSync(join(webProfileDir, "package.json"), "utf8"));
  assert.equal(webPkgJson.dependencies[WEB_PROFILE_BUNDLE], "^0.1.0");
  assert.ok(webPkgJson.dsh.profile.bundles.includes(WEB_PROFILE_BUNDLE));
  assert.equal(existsSync(join(webProfileDir, "pnpm-workspace.yaml")), false);
  const webScope = join(webProfileDir, "node_modules", "@dsh-stack");
  assert.ok(existsSync(webScope), "web profile must link canonical Stack packages");
  assert.ok(
    readdirSync(webScope).includes("bundle"),
    "web profile must resolve the bundle it declares",
  );
  // Re-running must not duplicate the bundle or clobber a pinned range.
  writeFileSync(
    join(webProfileDir, "package.json"),
    `${JSON.stringify({ ...webPkgJson, dependencies: { ...webPkgJson.dependencies, [WEB_PROFILE_BUNDLE]: "workspace:*" } }, null, 2)}\n`,
  );
  await ensureProfileComposition({
    home: webHome,
    pkgDir,
    profile: "web",
    bundle: WEB_PROFILE_BUNDLE,
    harnessDir,
  });
  const webRerun = JSON.parse(readFileSync(join(webProfileDir, "package.json"), "utf8"));
  assert.equal(webRerun.dependencies[WEB_PROFILE_BUNDLE], "workspace:*");
  assert.equal(webRerun.dsh.profile.bundles.filter((b) => b === WEB_PROFILE_BUNDLE).length, 1);
}
console.log("ensureProfileComposition ok");

// A symlink that no longer resolves must be repaired, not accepted. Provisioning
// used to treat any symlink as valid, so a stale or relative link survived every
// later pass and the Loader then failed with "cannot resolve profile bundle" — a
// message that points at the bundle rather than at the link.
const staleHome = join(root, "stale-home");
const staleProfileDir = join(staleHome, "profiles", "web");
mkdirSync(join(staleProfileDir, "node_modules", "@dsh-stack"), { recursive: true });
writeFileSync(join(staleProfileDir, "package.json"), "{}\n");
const staleBundle = join(staleProfileDir, "node_modules", "@dsh-stack", "bundle");
symlinkSync("../../../nowhere/bundle", staleBundle);
assert.equal(existsSync(staleBundle), false, "the stale link must start out broken");
await ensureProfileComposition({
  home: staleHome,
  pkgDir,
  profile: "web",
  bundle: WEB_PROFILE_BUNDLE,
  harnessDir,
});
assert.equal(
  existsSync(staleBundle),
  true,
  "a link that does not resolve must be replaced with one that does",
);
assert.ok(isAbsolute(readlinkSync(staleBundle)), "a repaired link must be absolute");
console.log("broken symlink repaired ok");

// A provisioned profile must carry the harness's own base and application rows,
// not just the Stack bundle. Seeding only the Stack bundle leaves the Stack
// entries that inject core services pending, so nothing binds the port and the
// profile process exits immediately.
const seededHome = join(root, "seeded-home");
const seededDir = join(seededHome, "profiles", "web");
mkdirSync(seededDir, { recursive: true });
// A provisioned profile must either carry the harness' shipped rows or refuse
// outright. Declaring only the Stack bundle is the one unacceptable outcome: it
// mounts, exits 0, and never serves a request. The two acceptable outcomes depend
// on whether the harness is installed where the launcher looks for it, which is
// exactly why both are asserted rather than only the seeded one.
let seeded;
try {
  await ensureProfileComposition({
    home: seededHome,
    pkgDir,
    profile: "web",
    bundle: WEB_PROFILE_BUNDLE,
    harnessDir,
  });
  seeded = JSON.parse(readFileSync(join(seededDir, "package.json"), "utf8"));
} catch (error) {
  assert.match(
    String(error?.message ?? error),
    /refusing to provision a profile/,
    "provisioning may only fail by refusing, never by writing a partial profile",
  );
  console.log("shipped template unreadable, provisioning refused ok");
}
const seededBundles = seeded?.dsh?.profile?.bundles ?? [];
for (const required of ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]) {
  if (seededBundles.length > 0) {
    assert.ok(
      seededBundles.includes(required),
      `a provisioned web profile must declare ${required}`,
    );
  }
}
if (seededBundles.length > 0) {
  assert.ok(
    seededBundles.includes(WEB_PROFILE_BUNDLE),
    "a provisioned profile must declare the Stack bundle",
  );
  assert.ok(
    seededBundles.indexOf("@deepseek-ai/dsh-web-app") < seededBundles.indexOf(WEB_PROFILE_BUNDLE),
    "application rows must load before the Stack bundle so the Stack can inject into them",
  );
  assert.ok(
    seededBundles.indexOf("@deepseek-ai/dsh-base") <
      seededBundles.indexOf("@deepseek-ai/dsh-web-app"),
    "the shipped template order must be preserved: base mounts before the application row",
  );
  console.log("shipped template seeded ok");
}

// The replaced harness shells must be disabled in the provisioned patch layer.
// Without it the server reports every entry active and still serves HTTP 200, but
// the browser refuses to boot the client tree: dsh-client-ui-sidebar and
// @dsh-stack/tweaks both declare the same slot. Only meaningful once a manifest
// was actually written, since a refusal leaves no profile to patch.
if (seededBundles.length > 0) {
  const patchPath = join(seededDir, "cordis.patch.yml");
  const patchDoc = YAML.parse(readFileSync(patchPath, "utf8"));
  for (const row of ["ui-sidebar", "ui-settings-general"]) {
    assert.ok(
      patchDoc.some((entry) => entry?.id === row && entry.disabled === true),
      `the provisioned patch layer must disable ${row}`,
    );
  }
  // Reconciling again must not duplicate the rows, and a person's own entries stay.
  patchDoc.push({ id: "webserver", config: { port: 3081 } });
  writeFileSync(patchPath, YAML.stringify(patchDoc), "utf8");
  await ensureProfileComposition({
    home: seededHome,
    pkgDir,
    profile: "web",
    bundle: WEB_PROFILE_BUNDLE,
    harnessDir,
  });
  const reconciled = YAML.parse(readFileSync(patchPath, "utf8"));
  assert.equal(
    reconciled.filter((entry) => entry?.id === "ui-sidebar").length,
    1,
    "reconciling must not duplicate a shell row",
  );
  assert.ok(
    reconciled.some((entry) => entry?.id === "webserver"),
    "a person's own patch entries must survive reconciliation",
  );
  console.log("stack patch layer seeded ok");
}

// parseWorktreeList: porcelain parsing, main-checkout flagging, detached entries.
const porcelain = [
  "worktree /repo",
  "HEAD aaa",
  "branch refs/heads/main",
  "",
  "worktree /repo/worktrees/issue-1",
  "HEAD bbb",
  "branch refs/heads/fix/1-thing",
  "",
  "worktree /repo/worktrees/detached",
  "HEAD ccc",
  "detached",
  "",
].join("\n");
const worktrees = parseWorktreeList(porcelain);
assert.equal(worktrees.length, 3);
assert.deepEqual(worktrees[0], { path: "/repo", branch: "main", isMain: true });
assert.deepEqual(worktrees[1], {
  path: "/repo/worktrees/issue-1",
  branch: "fix/1-thing",
  isMain: false,
});
assert.deepEqual(worktrees[2], { path: "/repo/worktrees/detached", branch: null, isMain: false });
console.log("parseWorktreeList ok");

// decidePrune: every unsafe state keeps with a reason; fully safe prunes.
assert.deepEqual(decidePrune({ branch: null, clean: true, unpushed: 0, hasMergedPr: true }), {
  action: "keep",
  reason: "detached HEAD",
});
assert.deepEqual(decidePrune({ branch: "b", clean: false, unpushed: 0, hasMergedPr: true }), {
  action: "keep",
  reason: "uncommitted changes",
});
assert.deepEqual(decidePrune({ branch: "b", clean: true, unpushed: null, hasMergedPr: true }), {
  action: "keep",
  reason: "no upstream branch",
});
assert.deepEqual(decidePrune({ branch: "b", clean: true, unpushed: 2, hasMergedPr: true }), {
  action: "keep",
  reason: "2 unpushed commit(s)",
});
assert.deepEqual(decidePrune({ branch: "b", clean: true, unpushed: 0, hasMergedPr: false }), {
  action: "keep",
  reason: "no merged PR for branch",
});
assert.deepEqual(decidePrune({ branch: "b", clean: true, unpushed: 0, hasMergedPr: true }), {
  action: "prune",
});
console.log("decidePrune ok");

rmSync(root, { recursive: true, force: true });

console.log("plugin check passed");

// jscpd:ignore-end
