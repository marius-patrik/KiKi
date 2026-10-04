/**
 * `/quotas/api/git/*` route handlers: repository overview (remote, branch,
 * stats, file tree, README, language breakdown), diff, status, log,
 * branches, checkout, discard, stash, commit and push.
 * @module providers/quotas/web/git-routes
 */

import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { sendJsonResponse } from "@dsh-stack/plugin-kit";
import { respondToAction } from "./action-response.js";
import { QUOTAS_PREFIX } from "./quotas-prefix.js";
import { readJsonBody } from "./read-request-body.js";
import { isRoute, type RouteContext } from "./route-context.js";

const PREFIX = `${QUOTAS_PREFIX}/api/git`;

/** Run a git command in `cwd`, returning `fallback` (instead of throwing) on failure. */
function runGit<T>(
  cwd: string,
  args: string[],
  timeout: number,
  parse: (out: string) => T,
  fallback: T,
): T {
  try {
    const out = execFileSync("git", args, { cwd, encoding: "utf-8", timeout }).trim();
    return parse(out);
  } catch {
    return fallback;
  }
}

/** Run a git command in `cwd` and respond `{ success: true, output }` (200) or the error message (500). */
async function respondToGitCommand(
  res: RouteContext["res"],
  cwd: string,
  args: string[],
  timeout = 5000,
): Promise<void> {
  await respondToAction(
    res,
    () => execFileSync("git", args, { cwd, encoding: "utf-8", timeout }).trim(),
    (output) => ({ success: true, output }),
  );
}

/** Resolve the origin remote URL and the owner/repo name it implies. */
function readRemoteAndName(repoPath: string) {
  const remoteUrl = runGit(repoPath, ["remote", "get-url", "origin"], 3000, (s) => s, "");
  let repoName = path.basename(repoPath);
  let owner = "workspace";
  if (remoteUrl) {
    const match = remoteUrl.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match && match[1] && match[2]) {
      owner = match[1];
      repoName = match[2];
    }
  }
  return { remoteUrl, repoName, owner };
}

/** Read HEAD's commit hash, author, relative date, and message. */
function readLatestCommit(repoPath: string) {
  return runGit(
    repoPath,
    ["log", "-1", "--pretty=format:%H%x09%h%x09%an%x09%ar%x09%s%x09%B"],
    3000,
    (raw) => {
      const parts = raw.split("\t");
      return {
        sha: parts[0] || "",
        shortSha: parts[1] || "",
        author: parts[2] || "",
        date: parts[3] || "",
        message: parts[4] || "",
        fullMessage: parts[5] || parts[4] || "",
      };
    },
    { sha: "", shortSha: "", author: "", date: "", message: "", fullMessage: "" },
  );
}

interface TreeEntry {
  name: string;
  type: "blob" | "tree";
  path: string;
  relPath: string;
  lastCommitMsg: string;
  lastCommitDate: string;
}

/** List one directory's tree entries at `subPath`, each with its last commit message/date. */
function readFileTree(repoPath: string, subPath: string): TreeEntry[] {
  const tree: TreeEntry[] = [];
  try {
    const refPath = subPath ? `HEAD:${subPath}` : "HEAD";
    const treeRaw = execSync(`git ls-tree ${refPath}`, {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 4000,
    }).trim();
    if (treeRaw) {
      for (const line of treeRaw.split("\n")) {
        const parts = line.split(/\s+/);
        if (parts.length < 4) continue;
        const type = parts[1] === "tree" ? "tree" : "blob";
        const name = line.substring(line.indexOf("\t") + 1).trim();
        const itemRelPath = subPath ? `${subPath}/${name}` : name;
        const itemFullPath = path.join(repoPath, itemRelPath);
        const { lastCommitMsg, lastCommitDate } = runGit(
          repoPath,
          ["log", "-1", "--pretty=format:%s%x09%ar", "--", itemRelPath],
          2000,
          (cLog) => {
            const cParts = cLog.split("\t");
            return { lastCommitMsg: cParts[0] || "", lastCommitDate: cParts[1] || "" };
          },
          { lastCommitMsg: "", lastCommitDate: "" },
        );
        tree.push({
          name,
          type,
          path: itemFullPath,
          relPath: itemRelPath,
          lastCommitMsg,
          lastCommitDate,
        });
      }
    }
  } catch {}
  tree.sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return tree;
}

/** Read the first matching README file (case/extension variants) at the repo root, if any. */
function readReadme(repoPath: string): { name: string; content: string } | null {
  const candidates = ["README.md", "readme.md", "README.txt", "README"];
  for (const cand of candidates) {
    const candPath = path.join(repoPath, cand);
    if (fs.existsSync(candPath)) {
      try {
        return { name: cand, content: fs.readFileSync(candPath, "utf-8") };
      } catch {}
    }
  }
  return null;
}

const EXT_MAP: Record<string, { name: string; color: string }> = {
  ".ts": { name: "TypeScript", color: "#3178c6" },
  ".tsx": { name: "TypeScript", color: "#3178c6" },
  ".js": { name: "JavaScript", color: "#f7df1e" },
  ".jsx": { name: "JavaScript", color: "#f7df1e" },
  ".mjs": { name: "JavaScript", color: "#f7df1e" },
  ".json": { name: "JSON", color: "#292929" },
  ".md": { name: "Markdown", color: "#083fa1" },
  ".sh": { name: "Shell", color: "#89e051" },
  ".bash": { name: "Shell", color: "#89e051" },
  ".py": { name: "Python", color: "#3572A5" },
  ".go": { name: "Go", color: "#00ADD8" },
  ".rs": { name: "Rust", color: "#dea584" },
  ".css": { name: "CSS", color: "#563d7c" },
  ".html": { name: "HTML", color: "#e34c26" },
  ".yaml": { name: "YAML", color: "#cb171e" },
  ".yml": { name: "YAML", color: "#cb171e" },
};

/** Compute the tracked-file language breakdown (name, percent, color) by extension. */
function readLanguages(repoPath: string): Array<{ name: string; percent: number; color: string }> {
  const languages: Array<{ name: string; percent: number; color: string }> = [];
  try {
    const filesRaw = execSync("git ls-files", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    const extCounts: Record<string, number> = {};
    let totalExt = 0;
    if (filesRaw) {
      for (const f of filesRaw.split("\n")) {
        const ext = path.extname(f).toLowerCase();
        if (ext && !f.includes("node_modules") && !f.includes("dist") && !f.includes("lib/")) {
          extCounts[ext] = (extCounts[ext] || 0) + 1;
          totalExt++;
        }
      }
    }
    const langCounts: Record<string, { count: number; color: string }> = {};
    for (const [ext, count] of Object.entries(extCounts)) {
      const info = EXT_MAP[ext] || { name: "Other", color: "#8b949e" };
      if (!langCounts[info.name]) langCounts[info.name] = { count: 0, color: info.color };
      const entry = langCounts[info.name];
      if (entry) entry.count += count;
    }
    for (const [name, data] of Object.entries(langCounts)) {
      const pct = totalExt > 0 ? Math.round((data.count / totalExt) * 100) : 0;
      if (pct > 0) languages.push({ name, percent: pct, color: data.color });
    }
    languages.sort((a, b) => b.percent - a.percent);
  } catch {}
  return languages;
}

/** Handle `/quotas/api/git/overview`: remote, branch, stats, file tree, README, languages. */
function handleOverview(ctx: RouteContext): boolean {
  const repoPath = ctx.url.searchParams.get("path") || "";
  const subPath = ctx.url.searchParams.get("subpath") || "";
  if (!repoPath) {
    sendJsonResponse(ctx.res, 400, { error: "path parameter required" });
    return true;
  }
  try {
    const { remoteUrl, repoName, owner } = readRemoteAndName(repoPath);
    const branch = runGit(repoPath, ["branch", "--show-current"], 3000, (s) => s || "main", "main");
    const totalCommits = runGit(
      repoPath,
      ["rev-list", "--count", "HEAD"],
      3000,
      (s) => parseInt(s, 10) || 0,
      0,
    );
    const tagsCount = runGit(repoPath, ["tag"], 3000, (s) => (s ? s.split("\n").length : 0), 0);
    const branchesCount = runGit(
      repoPath,
      ["branch", "-a"],
      3000,
      (s) => (s ? s.split("\n").length : 1),
      1,
    );
    const latestCommit = readLatestCommit(repoPath);
    const tree = readFileTree(repoPath, subPath);
    const readme = readReadme(repoPath);
    const languages = readLanguages(repoPath);

    sendJsonResponse(ctx.res, 200, {
      repoPath,
      repoName,
      owner,
      remoteUrl,
      branch,
      totalCommits,
      branchesCount,
      tagsCount,
      latestCommit,
      tree,
      subPath,
      readme,
      languages,
    });
  } catch (err) {
    sendJsonResponse(ctx.res, 500, { error: (err as Error).message });
  }
  return true;
}

/** Handle one `/quotas/api/git/*` request; returns `true` if it matched and was handled. */
export async function handleGitRoute(ctx: RouteContext): Promise<boolean> {
  const { req, res, url } = ctx;

  if (isRoute(ctx, `${PREFIX}/overview`, "GET")) return handleOverview(ctx);

  if (isRoute(ctx, `${PREFIX}/diff`, "GET")) {
    const repoPath = url.searchParams.get("path") || "";
    const file = url.searchParams.get("file") || "";
    if (!repoPath) {
      sendJsonResponse(res, 400, { error: "path parameter required" });
      return true;
    }
    try {
      const cmd = file ? `git diff HEAD -- "${file}"` : "git diff HEAD";
      const diff = execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 5000 });
      sendJsonResponse(res, 200, { repoPath, file, diff });
    } catch (err) {
      sendJsonResponse(res, 200, { repoPath, file, diff: "", error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/status`, "GET")) {
    const repoPath = url.searchParams.get("path") || "";
    if (!repoPath) {
      sendJsonResponse(res, 400, { error: "path parameter required" });
      return true;
    }
    try {
      const raw = execSync("git status --porcelain=v1 -b", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const lines = raw.split("\n");
      let branch = "HEAD";
      let ahead = 0;
      let behind = 0;
      const files: Array<{ code: string; path: string; staged: boolean; status: string }> = [];
      for (const line of lines) {
        if (line.startsWith("## ")) {
          const bInfo = line.slice(3);
          const match = bInfo.match(/^([^.\s]+)/);
          if (match && match[1]) branch = match[1];
          const aheadMatch = bInfo.match(/ahead (\d+)/);
          if (aheadMatch && aheadMatch[1]) ahead = parseInt(aheadMatch[1], 10);
          const behindMatch = bInfo.match(/behind (\d+)/);
          if (behindMatch && behindMatch[1]) behind = parseInt(behindMatch[1], 10);
        } else if (line.length >= 4) {
          const x = line[0];
          const y = line[1];
          const fPath = line.slice(3).trim();
          const staged = x !== " " && x !== "?";
          let status = "modified";
          if (x === "?" || y === "?") status = "untracked";
          else if (x === "A" || y === "A") status = "added";
          else if (x === "D" || y === "D") status = "deleted";
          files.push({ code: line.slice(0, 2), path: fPath, staged, status });
        }
      }
      sendJsonResponse(res, 200, { repoPath, branch, ahead, behind, files });
    } catch (err) {
      sendJsonResponse(res, 200, {
        repoPath,
        branch: "unknown",
        ahead: 0,
        behind: 0,
        files: [],
        error: (err as Error).message,
      });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/log`, "GET")) {
    const repoPath = url.searchParams.get("path") || "";
    try {
      const raw = execSync(
        'git log -n 50 --pretty=format:"%H%x09%h%x09%an%x09%ar%x09%s%x09%ad" --date=short',
        { cwd: repoPath, encoding: "utf-8", timeout: 5000 },
      ).trim();
      const commits = raw
        ? raw.split("\n").map((l) => {
            const parts = l.split("\t");
            return {
              fullSha: parts[0] || "",
              sha: parts[1] || parts[0]?.slice(0, 7) || "",
              author: parts[2] || "",
              date: parts[3] || "",
              message: parts[4] || "",
              dateFormatted: parts[5] || "",
            };
          })
        : [];
      sendJsonResponse(res, 200, { repoPath, commits });
    } catch (err) {
      sendJsonResponse(res, 200, { repoPath, commits: [], error: (err as Error).message });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/branches`, "GET")) {
    const repoPath = url.searchParams.get("path") || "";
    try {
      const raw = execSync("git branch -a", {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      let current = "main";
      const branches = raw
        ? raw.split("\n").map((b) => {
            const isCurrent = b.startsWith("*");
            const name = b.replace(/^[* ]+/, "").trim();
            if (isCurrent) current = name;
            return { name, isCurrent };
          })
        : [];
      sendJsonResponse(res, 200, { repoPath, current, branches });
    } catch (err) {
      sendJsonResponse(res, 200, {
        repoPath,
        current: "main",
        branches: [],
        error: (err as Error).message,
      });
    }
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/checkout`, "POST")) {
    const body = await readJsonBody(req);
    const repoPath = String(body["path"] || "");
    const branch = String(body["branch"] || "");
    const isNew = Boolean(body["create"]);
    const args = isNew ? ["checkout", "-b", branch] : ["checkout", branch];
    await respondToGitCommand(res, repoPath, args);
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/discard`, "POST")) {
    const body = await readJsonBody(req);
    const repoPath = String(body["path"] || "");
    const file = body["file"] ? String(body["file"]) : "";
    await respondToAction(res, () => {
      if (file) {
        execFileSync("git", ["checkout", "--", file], {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        });
      } else {
        execFileSync("git", ["checkout", "--", "."], {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        });
        execFileSync("git", ["clean", "-fd"], { cwd: repoPath, encoding: "utf-8", timeout: 5000 });
      }
    });
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/stash`, "POST")) {
    const body = await readJsonBody(req);
    const repoPath = String(body["path"] || "");
    await respondToGitCommand(res, repoPath, ["stash"]);
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/commit`, "POST")) {
    const body = await readJsonBody(req);
    const repoPath = String(body["path"] || "");
    const msg = String(body["message"] || "Update");
    await respondToAction(
      res,
      () => {
        execFileSync("git", ["add", "-A"], { cwd: repoPath, encoding: "utf-8", timeout: 5000 });
        return execFileSync("git", ["commit", "-m", msg], {
          cwd: repoPath,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
      },
      (output) => ({ success: true, output }),
    );
    return true;
  }

  if (isRoute(ctx, `${PREFIX}/push`, "POST")) {
    const body = await readJsonBody(req);
    const repoPath = String(body["path"] || "");
    await respondToGitCommand(res, repoPath, ["push"], 15000);
    return true;
  }

  return false;
}
