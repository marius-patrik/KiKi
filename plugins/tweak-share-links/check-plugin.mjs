// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling extensions
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "tweak-share-links-"));
process.env.HOME = root;
process.env.DSH_HOME = join(root, ".agents");

const plugin = await import("./lib/index.js");
const share = await import("./lib/share.js");
const { NS_SHARE } = await import("./lib/settings.js");

assertLoaderShape(plugin, "tweak-share-links");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

const home = join(root, ".agents");

// Boot the extension over stub settings + webServer services. Since 0.2.0 a
// plugin's Config is its form and the namespace is its entry id, so there is no
// registration to observe; what this plugin must declare is that it ships its own
// page for that form, and that it still mounts its share route.
const ctx = new Context();
const { service: settings, registrations } = stubSettingsService();
ctx.provide("settings", settings);
ctx.provide("webServer", {
  /** register implementation. */
  register(route) {
    assert.equal(route.kind, "prefix");
    assert.equal(route.path, "/share");
    return () => undefined;
  },
});
plugin.apply(ctx, {
  enabled: true,
  allowInteractive: false,
  advertisedHost: "",
  basePath: "/share",
});
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(NS_SHARE, "tweak-share-links", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("boot ok");

// Share renderer.
const eventLog = [
  JSON.stringify({
    type: "user/message",
    seq: 0,
    time: 1,
    data: { message: { content: "hello <world>" } },
  }),
  JSON.stringify({
    type: "assistant/message",
    seq: 1,
    time: 2,
    data: { message: { content: "hi there" } },
  }),
  JSON.stringify({ type: "tool/call", seq: 2, time: 3, data: { name: "bash" } }),
  JSON.stringify({ type: "tool/result", seq: 3, time: 4, data: { ok: true } }),
  "",
].join("\n");
const lines = share.parseLog(eventLog);
assert.equal(lines.length, 4);
assert.equal(lines[0].role, "user");
assert.equal(lines[0].text, "hello <world>");
assert.equal(lines[2].role, "tool");
const page = share.renderSharePage("session-1", lines, false);
assert.ok(page.includes("hello &lt;world&gt;"));
assert.ok(page.includes("session-1</h1>"));
assert.ok(!page.includes("#live"));
console.log("share renderer ok");

// Token equality + write/read round trip.
assert.ok(share.tokensEqual("a", "a"));
assert.ok(!share.tokensEqual("a", "b"));
const token = share.generateToken();
const tokenPath = await share.writeShareToken(home, token);
assert.equal(await share.readShareToken(home), token);
assert.ok(tokenPath.includes("share.token"));
assert.equal(await share.readShareToken(join(root, "nope")), undefined);
console.log("share token helpers ok");

// Share log path resolution finds a jsonl log we plant.
const wsDir = join(home, "sessions", "--Users-user--");
mkdirSync(join(wsDir, "session-abc"), { recursive: true });
writeFileSync(join(wsDir, "session-abc", "session.jsonl"), eventLog);
const found = await share.resolveSessionLogPath(home, "abc", "/Users/user");
assert.equal(found, join(wsDir, "session-abc", "session.jsonl"));
const foundPrefixed = await share.resolveSessionLogPath(home, "session-abc", "/Users/user");
assert.equal(foundPrefixed, join(wsDir, "session-abc", "session.jsonl"));
assert.equal(await share.resolveSessionLogPath(home, "missing", "/Users/user"), undefined);
const ids = await share.listSessionIds(home, "/Users/user");
assert.deepEqual(ids, ["abc"]);

// Interactive gate — handler renders read-only without token, and even with a
// token when allowInteractive is false.
rmSync(join(home, "share.token"), { force: true });
const handler = share.makeShareHandler(home, "/share", true);
/**
 * Handles a request to the `/share` endpoint.
 *
 * - Sets the response status using `writeHead`.
 * - Writes the response body using `end`.
 * - Returns the response object with `_status` and `_body`.
 *
 * On failure, returns a response with `_status` indicating the error and an empty `_body`.
 */
const respond = async (url) => {
  const res = {
    _status: 0,
    _body: "",
    /**
     * Sets the response status and begins writing the response body.
     *
     * @param {number} s - The status code to set for the response.
     * @returns {object} The response object with updated `_status` and an empty `_body`.
     * On failure, returns a response with `_status` indicating the error and an empty `_body`.
     */
    writeHead(s) {
      this._status = s;
    },
    /**
     * Ends the response by setting the response body and finalizes the response object.
     *
     * @param {string} b - The body content to set for the response.
     * @returns {object} The response object with updated `_status` and `_body`.
     * On failure, returns a response with `_status` indicating the error and an empty `_body`.
     */
    end(b) {
      this._body = b;
    },
  };
  await handler({ url }, res);
  return res;
};
const plain = await respond(`/share/abc`);
assert.equal(plain._status, 200);
assert.ok(!plain._body.includes("#live"));
const denied = await respond(`/share/abc?token=${token}`);
assert.ok(!denied._body.includes("#live"));
await share.writeShareToken(home, token);
const granted = await respond(`/share/abc?token=${token}`);
assert.ok(granted._body.includes("#live"));
const roHandler = share.makeShareHandler(home, "/share", false);
const roRes = {
  _status: 0,
  _body: "",
  /** writeHead implementation. */
  writeHead(s) {
    this._status = s;
  },
  /** end implementation. */
  end(b) {
    this._body = b;
  },
};
await roHandler({ url: `/share/abc?token=${token}` }, roRes);
assert.ok(!roRes._body.includes("#live"));
console.log("share log path helpers + interactive gate ok");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
