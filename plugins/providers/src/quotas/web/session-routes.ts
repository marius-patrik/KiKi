/**
 * `/quotas/api/sessions/*` route handlers: archiving empty/ping-pong-only
 * agent sessions out of the workspace index, and resolving the durable titles
 * the Host omits from cold session-list rows.
 * @module providers/quotas/web/session-routes
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";
import { resolveColdSessionTitles } from "./cold-session-titles.js";
import { QUOTAS_PREFIX } from "./quotas-prefix.js";
import { readJsonBody } from "./read-request-body.js";
import { isRoute, type RouteContext } from "./route-context.js";

const PREFIX = `${QUOTAS_PREFIX}/api/sessions`;
const SESSION_SUBDIRS = [
  "--Users-user--",
  "--Users-user-Projects-dsh-stack--",
  "--Users-user-agents--",
];

/** Whether a session's transcript, once decompressed, has no content beyond ping/pong. */
function isPingPongOnlySession(sessionsRoot: string, id: string): boolean {
  for (const sub of SESSION_SUBDIRS) {
    const fPath = path.join(sessionsRoot, sub, id, "session.jsonl.zstd");
    if (!fs.existsSync(fPath)) continue;
    try {
      const zlib = require("node:zlib");
      const compressed = fs.readFileSync(fPath);
      const decomp = zlib.zstdDecompressSync(compressed);
      const lines = decomp.toString("utf8").trim().split("\n");
      if (lines.length > 1) {
        const text = decomp.toString("utf8").toLowerCase();
        if (!text.includes("pong") && !text.includes("ping")) {
          return false;
        }
      }
    } catch {}
  }
  return true;
}

/** Handle one `/quotas/api/sessions/*` request; returns `true` if it matched and was handled. */
export async function handleSessionRoute(ctx: RouteContext): Promise<boolean> {
  const { res } = ctx;

  if (isRoute(ctx, `${PREFIX}/titles`, "POST")) {
    const body = await readJsonBody(ctx.req);
    const requested = body["ids"];
    if (!Array.isArray(requested)) {
      sendJsonResponse(res, 400, { error: "expected an 'ids' array of session ids" });
      return true;
    }
    const ids = requested.filter((id): id is string => typeof id === "string" && id !== "");
    try {
      sendJsonResponse(res, 200, { titles: await resolveColdSessionTitles(ctx.plugin, ids) });
    } catch (err) {
      sendJsonResponse(res, 503, { error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/archive-pong`, "POST")) {
    try {
      const home = os.homedir();
      const wsFile = path.join(home, ".agents/storages/workspace.json");
      const sessionsRoot = path.join(home, ".agents/sessions");
      let archivedCount = 0;
      if (fs.existsSync(wsFile)) {
        const ws = JSON.parse(fs.readFileSync(wsFile, "utf8"));
        const archived = new Set(ws.global?.archivedSessionIds || []);
        const workspaces = ws.tables?.workspaces || {};
        for (const [, w] of Object.entries(workspaces)) {
          const activeIds = (w as { sessionIds?: string[] }).sessionIds || [];
          const toKeep: string[] = [];
          for (const id of activeIds) {
            if (isPingPongOnlySession(sessionsRoot, id)) {
              archived.add(id);
              archivedCount++;
            } else {
              toKeep.push(id);
            }
          }
          (w as { sessionIds?: string[] }).sessionIds = toKeep;
        }
        ws.global.archivedSessionIds = Array.from(archived);
        fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2), "utf8");
      }
      sendJsonResponse(res, 200, { success: true, archivedCount });
    } catch (err) {
      sendJsonResponse(res, 500, { error: (err as Error).message });
    }
    return true;
  }

  return false;
}
