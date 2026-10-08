/**
 * `/quotas/api/fs/*` route handlers: directory listing, file read/write for
 * the monaco-backed preview/editor, and native application icon extraction.
 * @module providers/quotas/web/filesystem-routes
 */

import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";
import { readJsonBody } from "./read-request-body.js";
import { QUOTAS_PREFIX } from "./quotas-prefix.js";
import { isRoute, type RouteContext } from "./route-context.js";

const PREFIX = `${QUOTAS_PREFIX}/api/fs`;
const VENDOR_DIR_NAMES = new Set(["node_modules", "dist", "lib", ".git"]);
const ALWAYS_VISIBLE_DOTFILES = new Set([".cursor", ".agents"]);

/** List a directory's entries, filtering out vendor dirs and hidden dotfiles (except the always-visible ones). */
function listDirectory(targetPath: string) {
  const rawEntries = fs.readdirSync(targetPath, { withFileTypes: true });
  const entries: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    isRepo: boolean;
  }> = [];
  for (const dirent of rawEntries) {
    if (dirent.name.startsWith(".") && !ALWAYS_VISIBLE_DOTFILES.has(dirent.name)) continue;
    try {
      const full = path.join(targetPath, dirent.name);
      const isDir = dirent.isDirectory();
      const isVendor = VENDOR_DIR_NAMES.has(dirent.name);
      let isRepo = false;
      if (isDir && !isVendor) {
        try {
          isRepo =
            fs.existsSync(path.join(full, ".git")) ||
            fs.existsSync(path.join(full, ".github")) ||
            fs.existsSync(path.join(full, ".gitmodules"));
        } catch {}
      }
      entries.push({
        name: dirent.name,
        path: full,
        isDirectory: isDir,
        isFile: dirent.isFile(),
        isRepo,
      });
    } catch {}
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/** Locate the `.icns` icon file for a `.app` bundle or a bare `.icns` path. */
function resolveIcnsPath(targetPath: string): string | null {
  if (targetPath.endsWith(".icns")) return targetPath;
  if (!targetPath.endsWith(".app")) return null;

  const infoPlist = path.join(targetPath, "Contents/Info.plist");
  if (fs.existsSync(infoPlist)) {
    try {
      let iconName = execFileSync("defaults", ["read", infoPlist, "CFBundleIconFile"], {
        encoding: "utf-8",
        timeout: 2000,
      }).trim();
      if (iconName) {
        if (!iconName.endsWith(".icns")) iconName += ".icns";
        const candidate = path.join(targetPath, "Contents/Resources", iconName);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {}
  }

  const resDir = path.join(targetPath, "Contents/Resources");
  if (fs.existsSync(resDir)) {
    try {
      const icns = fs.readdirSync(resDir).find((f) => f.endsWith(".icns"));
      if (icns) return path.join(resDir, icns);
    } catch {}
  }
  return null;
}

/** Read the required `path` query param, sending a 400 (and returning `null`) if it's missing. */
function requireQueryPath(ctx: RouteContext): string | null {
  const rawPath = ctx.url.searchParams.get("path") || "";
  if (!rawPath) {
    sendJsonResponse(ctx.res, 400, { error: "path parameter required" });
    return null;
  }
  return path.resolve(rawPath);
}

/** Handle one `/quotas/api/fs/*` request; returns `true` if it matched and was handled. */
export async function handleFilesystemRoute(ctx: RouteContext): Promise<boolean> {
  const { req, res, url } = ctx;

  if (isRoute(ctx, PREFIX, "GET")) {
    const rawPath = url.searchParams.get("path") || "/";
    const targetPath = path.resolve(rawPath);
    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        sendJsonResponse(res, 200, {
          path: targetPath,
          isFile: true,
          size: stat.size,
          mtime: stat.mtimeMs,
          entries: [],
        });
        return true;
      }
      const entries = listDirectory(targetPath);
      const parent = path.dirname(targetPath);
      sendJsonResponse(res, 200, {
        path: targetPath,
        parent: parent !== targetPath ? parent : null,
        entries,
      });
    } catch (err) {
      sendJsonResponse(res, 200, {
        path: targetPath,
        parent: null,
        entries: [],
        error: (err as Error).message,
      });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/read`, "GET")) {
    const targetPath = requireQueryPath(ctx);
    if (targetPath === null) return true;
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        sendJsonResponse(res, 200, {
          path: targetPath,
          name: path.basename(targetPath),
          isDirectory: true,
          content: "",
        });
        return true;
      }
      if (stat.size > 2 * 1024 * 1024) {
        sendJsonResponse(res, 200, {
          path: targetPath,
          name: path.basename(targetPath),
          size: stat.size,
          content: "(File exceeds 2MB preview limit)",
          isTruncated: true,
        });
        return true;
      }
      const content = fs.readFileSync(targetPath, "utf-8");
      sendJsonResponse(res, 200, {
        path: targetPath,
        name: path.basename(targetPath),
        size: stat.size,
        content,
        isDirectory: false,
      });
    } catch (err) {
      sendJsonResponse(res, 500, { error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/icon`, "GET")) {
    const targetPath = requireQueryPath(ctx);
    if (targetPath === null) return true;
    try {
      if (!fs.existsSync(targetPath)) {
        sendJsonResponse(res, 404, { error: "File not found" });
        return true;
      }
      const cacheDir = path.join(os.homedir(), ".agents/cache/app-icons");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const hash = crypto.createHash("md5").update(targetPath).digest("hex");
      const cachePng = path.join(cacheDir, `${hash}.png`);

      if (fs.existsSync(cachePng)) {
        res.writeHead(200, {
          "content-type": "image/png",
          "cache-control": "public, max-age=86400",
        });
        fs.createReadStream(cachePng).pipe(res);
        return true;
      }

      const icnsPath = resolveIcnsPath(targetPath);
      if (icnsPath && fs.existsSync(icnsPath)) {
        try {
          execFileSync(
            "sips",
            ["-s", "format", "png", "-z", "32", "32", icnsPath, "--out", cachePng],
            {
              timeout: 3000,
            },
          );
          if (fs.existsSync(cachePng)) {
            res.writeHead(200, {
              "content-type": "image/png",
              "cache-control": "public, max-age=86400",
            });
            fs.createReadStream(cachePng).pipe(res);
            return true;
          }
        } catch {}
      }

      sendJsonResponse(res, 404, { error: "No icon available for target" });
    } catch (err) {
      sendJsonResponse(res, 500, { error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/write`, "POST")) {
    const body = await readJsonBody(req);
    const targetPath = path.resolve(String(body["path"] || ""));
    if (!targetPath) {
      sendJsonResponse(res, 400, { error: "Invalid path" });
      return true;
    }
    try {
      const content = String(body["content"] || "");
      fs.writeFileSync(targetPath, content, "utf-8");
      sendJsonResponse(res, 200, {
        success: true,
        path: targetPath,
        size: Buffer.byteLength(content, "utf-8"),
      });
    } catch (err) {
      sendJsonResponse(res, 500, { error: (err as Error).message });
    }
    return true;
  }

  return false;
}
