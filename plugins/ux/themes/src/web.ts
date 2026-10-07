/**
 * themes browser-facing API: the `/themes/api` prefix route the settings
 * Catalog/Installed panes call. Search proxies the configured Open VSX
 * catalog; install resolves the extension metadata node-side (the browser
 * sends only the namespace/name identity, never a download URL), downloads the
 * vsix, and stores every theme it carries; apply/remove persist through the
 * settings scope captured at mount. Follows the mountQuotaWeb pattern.
 * @module themes/web
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  downloadVsix,
  extractThemesFromVsix,
  resolveCatalogExtension,
  searchCatalog,
} from "./catalog.js";
import { installThemeSource, listInstalled } from "./index.js";
import type { StoredTheme } from "./store.js";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";

/** The route prefix the browser half POSTs to. */
export const THEMES_API_PREFIX = "/themes/api";

/** Largest accepted request body (search/install/remove payloads are tiny). */
const BODY_LIMIT = 64 * 1024;

/** Facts the mounted handler reads from the plugin composition. */
export interface ThemeWebDeps {
  /** Resolve the agent home this run boots under. */
  home(): string;
  /** Configured theme store root (relative to the home, or absolute). */
  root: string;
  /** Open VSX catalog base URL. */
  catalogUrl: string;
  /** Current persisted active theme id (empty = built-in). */
  active(): string;
  /** Persist the active theme id; rejects while no settings service is mounted. */
  setActive(id: string): Promise<void>;
}

/**
 * Mount the `/themes/api` prefix route on the web server.
 * @param ctx - plugin context (injects `webServer`).
 * @param deps - composition facts the handler closes over.
 * @returns the inject result (registration disposer chain).
 */
export function mountThemeWeb(ctx: Context, deps: ThemeWebDeps): unknown {
  return ctx.inject(["webServer"], (httpCtx) =>
    httpCtx.webServer.register({
      kind: "prefix",
      path: THEMES_API_PREFIX,
      handler: makeThemeHandler(deps),
    }),
  );
}

/** One malformed-request rejection (HTTP 400). */
class BadRequest extends Error {}

/** Read and parse a JSON request body, bounded to {@link BODY_LIMIT}. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > BODY_LIMIT) throw new BadRequest("request body too large");
    chunks.push(buffer);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequest("request body is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequest("request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

/** Read one required string field off a request body. */
function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value === "") {
    throw new BadRequest(`missing or empty "${field}"`);
  }
  return value;
}

/**
 * Install one catalog extension: resolve its metadata, download the vsix,
 * extract every theme source, and store each with the extension provenance.
 * @param deps - composition facts.
 * @param namespace - extension namespace (publisher).
 * @param name - extension name.
 * @returns the stored themes.
 */
async function installCatalogExtension(
  deps: ThemeWebDeps,
  namespace: string,
  name: string,
): Promise<StoredTheme[]> {
  const extension = `${namespace}.${name}`;
  const metadata = await resolveCatalogExtension(deps.catalogUrl, namespace, name);
  if (metadata.download === "") {
    throw new BadRequest(`extension ${extension} has no vsix download`);
  }
  const vsixPath = await downloadVsix(metadata.download);
  try {
    const sources = await extractThemesFromVsix(vsixPath);
    if (sources.length === 0) {
      throw new BadRequest(`extension ${extension} contains no themes`);
    }
    const stored: StoredTheme[] = [];
    for (const source of sources) {
      stored.push(await installThemeSource(deps.home(), deps.root, source, { extension }));
    }
    return stored;
  } finally {
    await rm(dirname(vsixPath), { recursive: true, force: true });
  }
}

/**
 * Sets up a handler for theme-related requests.
 *
 * Guarantees a JSON response with status codes 200 or 405.
 * On failure, returns a 405 with "method not allowed" error.
 *
 * @param deps - Dependency injection for theme catalog.
 * @returns A function that processes incoming POST requests to search for themes.
 */
function makeThemeHandler(
  deps: ThemeWebDeps,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://themes.local");
    const pathname = url.pathname;

    try {
      if (req.method !== "POST") {
        sendJsonResponse(res, 405, { error: "method not allowed" });
        return;
      }

      // POST /themes/api/search {query, limit?} — Open VSX theme search.
      if (pathname === `${THEMES_API_PREFIX}/search`) {
        const body = await readJsonBody(req);
        const query = stringField(body, "query");
        const limit = typeof body.limit === "number" ? body.limit : undefined;
        const results = await searchCatalog(deps.catalogUrl, query, limit);
        sendJsonResponse(res, 200, { results });
        return;
      }

      // POST /themes/api/install {namespace, name} — resolve, download, store.
      if (pathname === `${THEMES_API_PREFIX}/install`) {
        const body = await readJsonBody(req);
        const namespace = stringField(body, "namespace");
        const name = stringField(body, "name");
        const installed = await installCatalogExtension(deps, namespace, name);
        sendJsonResponse(res, 200, { installed });
        return;
      }

      // POST /themes/api/remove {id} — delete one stored theme; clearing the
      // persisted active choice when it pointed at the removed theme.
      if (pathname === `${THEMES_API_PREFIX}/remove`) {
        const body = await readJsonBody(req);
        const id = stringField(body, "id");
        const { removeTheme, storeHandle } = await import("./store.js");
        const removed = await removeTheme(storeHandle(deps.home(), deps.root), id);
        if (!removed) throw new BadRequest(`no installed theme "${id}"`);
        if (deps.active() === id) await deps.setActive("");
        sendJsonResponse(res, 200, { removed: id });
        return;
      }

      // POST /themes/api/apply {id} — persist the active theme id; the id
      // must be installed (empty selects the built-in preference).
      if (pathname === `${THEMES_API_PREFIX}/apply`) {
        const body = await readJsonBody(req);
        const id = typeof body.id === "string" ? body.id : "";
        if (id !== "") {
          const installed = await listInstalled(deps.home(), deps.root);
          if (!installed.some((theme) => theme.id === id)) {
            throw new BadRequest(`no installed theme "${id}"`);
          }
        }
        await deps.setActive(id);
        sendJsonResponse(res, 200, { active: id });
        return;
      }

      sendJsonResponse(res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof BadRequest) {
        sendJsonResponse(res, 400, { error: error.message });
        return;
      }
      sendJsonResponse(res, 500, { error: (error as Error).message });
    }
  };
}
