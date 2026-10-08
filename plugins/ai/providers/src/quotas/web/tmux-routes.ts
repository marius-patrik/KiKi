/**
 * `/quotas/api/tmux/*` route handlers: list/create/rename/kill sessions,
 * capture pane output, send keys, and manage windows.
 * @module providers/quotas/web/tmux-routes
 */

import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";
import { respondToAction } from "./action-response.js";
import { QUOTAS_PREFIX } from "./quotas-prefix.js";
import { readJsonBody } from "./read-request-body.js";
import { sanitizeDigits, sanitizeIdentifier } from "./sanitize.js";
import { auditDestructiveAction } from "./audit-destructive-action.js";
import { isRoute, type RouteContext } from "./route-context.js";

const PREFIX = `${QUOTAS_PREFIX}/api/tmux`;

/** Handle one `/quotas/api/tmux/*` request; returns `true` if it matched and was handled. */
export async function handleTmuxRoute(ctx: RouteContext): Promise<boolean> {
  const { req, res, url } = ctx;

  if (isRoute(ctx, `${PREFIX}/sessions`, "GET")) {
    try {
      const raw = execSync(
        'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{pane_current_path}" 2>/dev/null || true',
        { encoding: "utf-8", timeout: 1500 },
      ).trim();
      const sessions = raw
        ? raw
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const parts = line.split("|");
              const createdEpoch = parseInt(parts[3] ?? "0", 10) * 1000;
              return {
                name: parts[0] ?? "",
                windows: parseInt(parts[1] ?? "1", 10),
                attached: parts[2] === "1",
                created: createdEpoch,
                formattedTime: createdEpoch ? new Date(createdEpoch).toLocaleTimeString() : "",
                cwd: parts[4] ?? "",
              };
            })
        : [];
      sendJsonResponse(res, 200, { sessions });
    } catch (err) {
      sendJsonResponse(res, 200, { sessions: [], error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/new`, "POST")) {
    const body = await readJsonBody(req);
    const name = sanitizeIdentifier(body["name"], `term-${Date.now().toString(36)}`);
    const cwd = String(body["cwd"] || "").trim();
    await respondToAction(
      res,
      () => {
        if (cwd && fs.existsSync(cwd)) {
          execFileSync("tmux", ["new-session", "-d", "-s", name, "-c", cwd]);
        } else {
          execFileSync("tmux", ["new-session", "-d", "-s", name]);
        }
      },
      () => ({ success: true, name }),
    );
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/rename`, "POST")) {
    const body = await readJsonBody(req);
    const oldName = sanitizeIdentifier(body["oldName"] || body["name"]);
    const newName = sanitizeIdentifier(body["newName"]);
    if (oldName && newName) {
      await respondToAction(
        res,
        () => execFileSync("tmux", ["rename-session", "-t", oldName, newName]),
        () => ({ success: true, name: newName }),
      );
    } else {
      sendJsonResponse(res, 400, { error: "oldName and newName required" });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/kill`, "POST")) {
    const body = await readJsonBody(req);
    const name = sanitizeIdentifier(body["name"]);
    if (name) {
      auditDestructiveAction(req, "tmux", "kill-session", name);
      await respondToAction(res, () => execSync(`tmux kill-session -t ${name}`, { timeout: 2000 }));
    } else {
      sendJsonResponse(res, 400, { error: "session name required" });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/capture`, "GET")) {
    const name = sanitizeIdentifier(url.searchParams.get("name"), "0");
    const ansi = url.searchParams.get("ansi") === "1";
    try {
      const flag = ansi ? "-e -p" : "-p";
      const buffer = execSync(`tmux capture-pane ${flag} -t ${name}`, {
        encoding: "utf-8",
        timeout: 2000,
      });
      sendJsonResponse(res, 200, { buffer });
    } catch (err) {
      sendJsonResponse(res, 200, {
        buffer: "(unable to capture session output)",
        error: (err as Error).message,
      });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/send-keys`, "POST")) {
    const body = await readJsonBody(req);
    const name = sanitizeIdentifier(body["name"], "0");
    const keys = String(body["keys"] || "");
    const isLiteral = Boolean(body["isLiteral"]);
    const pressEnter = Boolean(body["pressEnter"]);

    await respondToAction(res, () => {
      if (isLiteral) {
        if (keys) execFileSync("tmux", ["send-keys", "-t", name, "-l", keys]);
        if (pressEnter) execFileSync("tmux", ["send-keys", "-t", name, "Enter"]);
      } else if (keys) {
        execFileSync("tmux", ["send-keys", "-t", name, keys]);
      }
    });
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/windows`, "GET")) {
    const name = sanitizeIdentifier(url.searchParams.get("name"), "0");
    try {
      const raw = execSync(
        `tmux list-windows -t ${name} -F "#{window_index}|#{window_name}|#{window_active}" 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 1500 },
      ).trim();
      const windows = raw
        ? raw
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const parts = line.split("|");
              return {
                index: parseInt(parts[0] ?? "0", 10),
                name: parts[1] ?? "",
                active: parts[2] === "1",
              };
            })
        : [];
      sendJsonResponse(res, 200, { windows });
    } catch (err) {
      sendJsonResponse(res, 200, { windows: [], error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/select-window`, "POST")) {
    const body = await readJsonBody(req);
    const name = sanitizeIdentifier(body["name"], "0");
    const index = sanitizeDigits(body["index"], "0");
    await respondToAction(res, () =>
      execFileSync("tmux", ["select-window", "-t", `${name}:${index}`]),
    );
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/sessions/new-window`, "POST")) {
    const body = await readJsonBody(req);
    const name = sanitizeIdentifier(body["name"], "0");
    const windowName = sanitizeIdentifier(body["windowName"], "win");
    await respondToAction(res, () =>
      execFileSync("tmux", ["new-window", "-t", name, "-n", windowName]),
    );
    return true;
  }

  return false;
}
