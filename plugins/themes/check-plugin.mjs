// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import { assertLoaderShape, stubSettingsService } from "../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "themes-"));

const plugin = await import("./lib/index.js");
const theme = await import("./lib/theme.js");
const store = await import("./lib/store.js");
const catalog = await import("./lib/catalog.js");
const { NS } = await import("./lib/settings.js");

assertLoaderShape(plugin, "themes");
assert.equal(plugin.THEMES_ROUTE, "/themes.json");
assert.equal(plugin.ALIAS_TOKENS.length, 13);
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// theme: VS Code JSON → definition (mapping + scheme + fallbacks).
const vsSource = theme.parseVsCodeTheme(
  JSON.stringify({
    name: "Monokai Pro",
    type: "dark",
    colors: {
      "editor.background": "#2d2a2e",
      "editor.foreground": "#fcfcfa",
      "sideBar.background": "#221f22",
    },
  }),
);
assert.equal(vsSource.type, "dark");
assert.equal(vsSource.colors["editor.background"], "#2d2a2e");
const vsDef = theme.mapTheme(vsSource);
assert.equal(vsDef.id, "monokai-pro");
assert.equal(vsDef.colorScheme, "dark");
assert.equal(vsDef.tokens["--dsw-alias-bg-base"], "#2d2a2e");
assert.equal(vsDef.tokens["--dsw-specific-sidebar-fill"], "#221f22");
assert.equal(vsDef.tokens["--dsw-alias-label-primary"], "#fcfcfa");
assert.equal(
  vsDef.tokens["--dsw-alias-state-success-primary"],
  theme.TOKEN_FALLBACKS["--dsw-alias-state-success-primary"].dark,
);
assert.equal(Object.keys(vsDef.tokens).length, 13);
console.log("vs-code map ok:", vsDef.id);

// theme: light scheme + rgb-normalization.
const lightDef = theme.mapTheme(
  theme.parseVsCodeTheme(
    JSON.stringify({
      name: "Paper",
      type: "light",
      colors: { "editor.background": "#fff" },
    }),
  ),
);
assert.equal(lightDef.colorScheme, "light");
assert.equal(lightDef.tokens["--dsw-alias-bg-base"], "#ffffff");
assert.equal(theme.normalizeColor("#ABC"), "#aabbcc");
console.log("light + normalize ok");

// theme: tmTheme XML parsing (background → editor.background, scheme infer).
const tmDef = theme.mapTheme(
  theme.parseTmThemeXml(`
  <dict>
    <key>name</key><string>Midnight</string>
    <key>settings</key><dict>
      <key>background</key><string>#0b1021</string>
      <key>foreground</key><string>#d8dee9</string>
    </dict>
  </dict>
`),
);
assert.equal(tmDef.id, "midnight");
assert.equal(tmDef.colorScheme, "dark");
assert.equal(tmDef.tokens["--dsw-alias-bg-base"], "#0b1021");
assert.equal(tmDef.tokens["--dsw-alias-label-primary"], "#d8dee9");
console.log("tmtheme parse ok:", tmDef.id);

// store: save / list / read / remove round-trip under a temp home.
const home = join(root, "home");
const handle = store.storeHandle(home, "themes");
assert.equal(handle.dir, join(home, "themes"));
assert.equal((await store.listThemes(handle)).length, 0);
await store.saveTheme(handle, { ...vsDef, name: "Monokai Pro" });
const listed = await store.listThemes(handle);
assert.equal(listed.length, 1);
assert.equal(listed[0].id, "monokai-pro");
assert.equal((await store.readTheme(handle, "monokai-pro.json")).name, "Monokai Pro");
assert.ok(await store.removeTheme(handle, "monokai-pro"));
assert.equal((await store.listThemes(handle)).length, 0);
console.log("store round-trip ok");

// store: corrupt file is skipped with a warning.
writeFileSync(handle.file("broken.json"), "{not json");
const warned = [];
const afterCorrupt = await store.listThemes(handle, (m) => warned.push(m));
assert.equal(afterCorrupt.length, 0);
assert.ok(warned.length === 1);
console.log("store corrupt-skip ok");

// catalog: extract themes from a real vsix (zip) via system unzip.
const extRoot = join(root, "ext");
mkdirSync(join(extRoot, "extension", "themes"), { recursive: true });
writeFileSync(
  join(extRoot, "extension", "themes", "aurora.json"),
  JSON.stringify({
    name: "Aurora",
    type: "dark",
    colors: { "editor.background": "#000000" },
  }),
);
const vsixPath = join(root, "aurora.vsix");
execFileSync("zip", ["-q", "-r", vsixPath, "extension"], { cwd: extRoot });
const extracted = await catalog.extractThemesFromVsix(vsixPath);
assert.equal(extracted.length, 1);
assert.equal(extracted[0].name, "Aurora");
assert.equal(extracted[0].type, "dark");
console.log("catalog vsix extraction ok");

// catalog: search against a local catalog server.
const catalogServer = createServer((req, res) => {
  if (req.url.includes("/api/-/search")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        extensions: [
          {
            namespace: "octref",
            name: "theme-monokai-pro",
            displayName: "Monokai Pro",
            description: "A theme",
            version: "1.0.0",
            downloadCount: 123,
            files: { download: "http://127.0.0.1:1/monokai.vsix" },
          },
        ],
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => catalogServer.listen(0, "127.0.0.1", resolve));
const catalogUrl = `http://127.0.0.1:${catalogServer.address().port}`;
const hits = await catalog.searchCatalog(catalogUrl, "monokai");
assert.equal(hits.length, 1);
assert.equal(hits[0].namespace, "octref");
assert.equal(hits[0].download, "http://127.0.0.1:1/monokai.vsix");
await new Promise((resolve) => catalogServer.close(resolve));
console.log("catalog search ok");

// plugin: apply over stub settings + webServer; /themes.json route registered
// and answers with the store contents.
const ctx = new Context();
const registered = [];
const themesHome = join(root, "route-home");
process.env.DSH_HOME = themesHome;
const storeFor = store.storeHandle(themesHome, "themes");
await store.saveTheme(storeFor, { ...vsDef, name: "Monokai Pro" });

// Since 0.2.0 a plugin's own Config IS its form and the namespace is its entry
// id, so there is no registration to observe: what this plugin must declare is
// that it ships its own page for the form `ThemesConfig` projects.
const config = plugin.Config({ active: "paper" });
const writes = [];
// `update` stands in for the real write plus the Loader's volatile commit: the
// settings service persists into the profile patch, then the Loader commits the
// new value into the very reference the plugin reads.
const commitVolatile = Symbol.for("cosmokit.volatile.write");
const { service: settings, registrations } = stubSettingsService();
settings.update = async (ns, patch) => {
  assert.equal(ns, NS, "the write must address this plugin's own entry id");
  writes.push(patch);
  for (const [key, value] of Object.entries(patch)) config[key][commitVolatile](value);
};
ctx.provide("settings", settings);
ctx.provide("webServer", {
  /**
   * Registers a new namespace or route, ensuring it is not already registered.
   * Returns an object with a getter method for the namespace and an undefined watch method.
   * Fails if the namespace or route is already registered or if the provided parameters are invalid.
   */
  register(route) {
    registered.push(route);
    return () => undefined;
  },
});
plugin.apply(ctx, config);
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("plugin declares its own settings page ok");

const themesRoute = registered.find((r) => r.path === "/themes.json");
assert.ok(themesRoute, "expected /themes.json route to be registered");
assert.equal(themesRoute.kind, "exact");
const apiRoute = registered.find((r) => r.path === "/themes/api");
assert.ok(apiRoute, "expected /themes/api prefix route to be registered");

/** Minimal response double capturing the JSON a handler sends. */
function jsonRes() {
  return {
    _status: 0,
    _body: "",
    /**
     * Records the status code.
     * @param {number} s - the status to record.
     */
    writeHead(s) {
      this._status = s;
    },
    /**
     * Records the response body.
     * @param {string|Buffer} b - The body content to be sent in the response.
     * Guarantees that the body is captured for later assertion.
     */
    end(b) {
      this._body = String(b);
    },
  };
}

/** Minimal request double carrying a JSON body the themes API can parse. */
function jsonReq(url, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.url = url;
  req.method = "POST";
  return req;
}

// The route reports the live reference it was handed at apply time, not a
// value captured when the plugin booted.
const res = jsonRes();
await themesRoute.handler({ url: "/themes.json" }, res);
assert.equal(res._status, 200);
assert.ok(res._body.includes('"monokai-pro"'));
assert.ok(res._body.includes('"active":"paper"'));
assert.ok(res._body.includes('"root":"themes"'));

// Applying a theme writes through the settings service rather than a captured
// writer, and the committed value is what the route then reports — the live-update
// path no longer depends on a settings.get read or a module-level mirror.
const applied = jsonRes();
await apiRoute.handler(jsonReq("/themes/api/apply", { id: "monokai-pro" }), applied);
assert.equal(applied._status, 200);
assert.deepEqual(applied._body, '{"active":"monokai-pro"}');
assert.deepEqual(writes, [{ active: "monokai-pro" }]);
const afterApply = jsonRes();
await themesRoute.handler({ url: "/themes.json" }, afterApply);
assert.ok(afterApply._body.includes('"active":"monokai-pro"'));

// Removing the active theme clears the persisted choice the same way.
const cleared = jsonRes();
await apiRoute.handler(jsonReq("/themes/api/remove", { id: "monokai-pro" }), cleared);
assert.equal(cleared._status, 200);
assert.deepEqual(writes[1], { active: "" });
delete process.env.DSH_HOME;
console.log("plugin route wiring ok");

// client bundle: hand-authored bundle registers the loader id and exports
// apply + inject(['slots','theme']).
const bundleText = readFileSync(new URL("./lib/client.js", import.meta.url), "utf8");
assert.ok(bundleText.includes("__ModuleLoader__.load"));
assert.ok(bundleText.includes('id: "themes"'));
assert.ok(bundleText.includes("exports.apply = apply"));
assert.ok(bundleText.includes('exports.inject = ["slots", "theme"]'));
const loader = {};
globalThis.window = {
  __ModuleLoader__: {
    load: (spec) => {
      loader.spec = spec;
    },
  },
};
await import(new URL("./lib/client.js", import.meta.url));
assert.equal(loader.spec.id, "@dsh-stack/themes");
const clientExports = loader.spec.factory((spec) => {
  if (spec === "react") return {};
  throw new Error("unexpected require: " + spec);
}, {});
assert.deepEqual(clientExports.inject, ["slots", "theme"]);
const clientRegistrants = new Map();
globalThis.fetch = async () => ({ ok: true, json: async () => ({ active: "", themes: [] }) });
const clientCtx = {
  /**
   * Fetches and applies the active theme from the server.
   * Guarantees that the `theme` is injected into the context.
   * Throws an error if the `spec` does not match "react".
   * @param {string} spec - The specification to check against.
   * @throws {Error} If `spec` is not "react".
   */
  effect(fn) {
    fn();
  },
  /**
   * Fetches and applies the active theme from the server.
   *
   * Guarantees that the active theme is applied to the document.
   * Throws an error if the fetch fails or an unexpected spec is requested.
   *
   * @returns The current theme context.
   */
  on() {
    return () => undefined;
  },
  theme: {
    getTheme: () => ({ active: { id: "light" }, themes: [] }),
    /** setTheme implementation. */
    setTheme() {},
    /**
     * Registers the client context for theme management.
     * Guarantees that the active theme is applied to the document.
     * Throws an error if the fetch fails or an unexpected spec is requested.
     * @param {string} spec - The specification to check against.
     * @throws {Error} If `spec` is not "react" or if the fetch fails.
     */
    register() {
      return () => undefined;
    },
  },
  slots: {
    /**
     * Executes the provided function `fn` within the context of the client.
     * Guarantees that the `theme` is injected into the context if `spec` matches "react".
     * Throws an error if `spec` does not match "react".
     * @param {string} spec - The specification to check against.
     * @param {function} fn - The function to execute in the context.
     * @throws {Error} If `spec` is not "react".
     */
    inject(name, fn) {
      clientRegistrants.set(name, fn);
    },
    /** register implementation. */
    register(spec) {
      return spec;
    },
  },
};
clientExports.apply(clientCtx);
// The theme directory is now one page of the Appearance section, not a
// standalone settings section; it registers into the seat the Appearance
// section declares.
const themesTab = clientRegistrants.get("settings.appearance.tab")();
assert.equal(themesTab.name, "settings.appearance.tab");
assert.equal(themesTab.id, "themes");
assert.equal(themesTab.order, 30);
assert.equal(themesTab.label(), "Themes");
const themesTabInject = themesTab.inject();
assert.ok(themesTabInject.applyTheme, "themes appearance tab applyTheme callback missing");
assert.ok(themesTabInject.hooks.themeSnapshot, "themes appearance tab themeSnapshot hook missing");
console.log("client bundle shape ok");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
