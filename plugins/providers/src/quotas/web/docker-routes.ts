/**
 * `/quotas/api/docker/*` route handlers: list containers, start/stop/
 * restart/remove a container, and tail its logs.
 * @module providers/quotas/web/docker-routes
 */

import { execSync } from "node:child_process";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";
import { respondToAction } from "./action-response.js";
import { QUOTAS_PREFIX } from "./quotas-prefix.js";
import { readJsonBody } from "./read-request-body.js";
import { sanitizeIdentifier } from "./sanitize.js";
import { auditDestructiveAction } from "./audit-destructive-action.js";
import { isRoute, type RouteContext } from "./route-context.js";

const PREFIX = `${QUOTAS_PREFIX}/api/docker`;

/**
 * Container actions this route will execute. `stop` and `rm` destroy running
 * work, so every one of them is audited below before it runs.
 */
const CONTAINER_ACTIONS = ["start", "stop", "restart", "rm"];

/** Handle one `/quotas/api/docker/*` request; returns `true` if it matched and was handled. */
export async function handleDockerRoute(ctx: RouteContext): Promise<boolean> {
  const { req, res, url } = ctx;

  if (isRoute(ctx, `${PREFIX}/containers`, "GET")) {
    try {
      const raw = execSync(
        'docker ps -a --format "{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}|{{.Ports}}|{{.Mounts}}|{{.Labels}}" 2>/dev/null || true',
        { encoding: "utf-8", timeout: 2000 },
      ).trim();
      const containers = raw
        ? raw
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const parts = line.split("|");
              const status = parts[2] ?? "";
              return {
                id: parts[0] ?? "",
                image: parts[1] ?? "",
                status,
                name: parts[3] ?? "",
                ports: parts[4] ?? "",
                mounts: parts[5] ?? "",
                labels: parts[6] ?? "",
                isRunning: status.startsWith("Up"),
              };
            })
        : [];
      sendJsonResponse(res, 200, { containers });
    } catch (err) {
      sendJsonResponse(res, 200, { containers: [], error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/containers/action`, "POST")) {
    const body = await readJsonBody(req);
    const id = sanitizeIdentifier(body["id"]);
    const action = String(body["action"] || "");
    if (CONTAINER_ACTIONS.includes(action) && id) {
      auditDestructiveAction(req, "docker", action, id);
      await respondToAction(res, () => execSync(`docker ${action} ${id}`, { timeout: 5000 }));
    } else {
      sendJsonResponse(res, 400, { error: "invalid action or container id" });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/containers/logs`, "GET")) {
    const id = sanitizeIdentifier(url.searchParams.get("id"));
    if (id) {
      try {
        const logs = execSync(`docker logs --tail 100 ${id} 2>&1`, {
          encoding: "utf-8",
          timeout: 3000,
        });
        sendJsonResponse(res, 200, { logs });
      } catch (err) {
        sendJsonResponse(res, 200, {
          logs: "(unable to fetch container logs)",
          error: (err as Error).message,
        });
      }
    } else {
      sendJsonResponse(res, 400, { error: "container id required" });
    }
    return true;
  }

  return false;
}
