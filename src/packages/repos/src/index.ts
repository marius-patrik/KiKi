/**
 * `repos`: repo workflows (status, branch, commit, push, PR) for the dsh
 * harness. All `git` commands run through `ctx.subprocess` — never
 * shell-interpreted — against the working directory the caller names, so the
 * tools work over the same backend the filesystem seam serves. GitHub pushes
 * and PRs resolve the bearer token from the shared vault (`ctx.accounts`) or
 * the `GITHUB_OAUTH_TOKEN`/`GH_TOKEN` environment fallback; this plugin never
 * stores credentials itself.
 *
 * The remote and base-branch defaults live in the plugin's own `RepoConfig`,
 * which the settings service projects as the `repos` form; the tools read those
 * defaults through the live references in that Config at each call. The
 * `dsh repos` CLI (bin/repos.mjs) edits the same two keys.
 * @module repos
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-subprocess";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import {
  RepoConfig,
  defaultRemote,
  defaultBaseBranch,
  type RepoConfig as RepoConfigType,
} from "./settings.js";
import { runGit, currentBranch, GitCommandError } from "./git.js";
import { resolveGitHubToken, createPullRequest } from "./github.js";

export type * from "./settings.js";
export type * from "./git.js";
export type * from "./github.js";

export const name = "repos";
export const inject = ["subprocess", "tools"];

export const Config = RepoConfig;

/** The working directory a tool operates on: the named path, or the cwd. */
function workDir(rawPath: string | undefined): string {
  return rawPath !== undefined && rawPath.length > 0 ? rawPath : process.cwd();
}

/**
 * Resolve the GitHub token for a push/PR tool call, throwing when no vault
 * record or environment fallback is available.
 */
async function requiredToken(ctx: Context): Promise<string> {
  const token = await resolveGitHubToken(ctx);
  if (token === null) {
    throw new Error(
      "repos: no GitHub credential available — run `dsh accounts import` (gh hosts.yml) or set GITHUB_OAUTH_TOKEN/GH_TOKEN",
    );
  }
  return token;
}

/**
 * Register the repo workflow tools and declare this plugin's settings page.
 *
 * Since 0.2.0 no settings form is registered: the settings service projects the
 * volatile Config fields of this plugin's own `repos` entry, so `RepoConfig` is
 * the form and its namespace is this plugin's entry id. Both defaults are
 * volatile, so the tools read them through `defaultRemote(config)` /
 * `defaultBaseBranch(config)`, which dereference the live references handed to
 * `apply`; the Loader commits a settings write into those same references, so a
 * change reaches the tools without a remount. What remains to declare is that
 * this plugin ships its own page for the form.
 *
 * @param ctx - the plugin context carrying `subprocess` and `tools`.
 * @param config - this entry's projected Config, carrying the live default references.
 */
export function apply(ctx: Context, config: RepoConfigType): void {
  declareCustomSettingsPage(ctx);

  ctx.tools.register(
    defineTool({
      name: "repo-status",
      description:
        "Show the git status of a repository: current branch, staged and unstaged changes, and untracked files.",
      parameters: {
        path: {
          type: "string",
          description: "Working directory of the repository (defaults to the agent cwd).",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", required: true },
            branch: { type: "string" },
            detached: { type: "boolean", required: true },
            staged: { type: "array", items: { type: "string" }, required: true },
            unstaged: { type: "array", items: { type: "string" }, required: true },
            untracked: { type: "array", items: { type: "string" }, required: true },
          },
        },
        render: (args, value) => [
          {
            type: "text",
            text: value.detached
              ? `repo ${value.path} is in a detached HEAD state with ${value.staged.length} staged, ${value.unstaged.length} unstaged, ${value.untracked.length} untracked.`
              : `repo ${value.path} on branch ${value.branch} with ${value.staged.length} staged, ${value.unstaged.length} unstaged, ${value.untracked.length} untracked.`,
          },
        ],
      },
      /**
       * Executes the specified Git repository action based on the provided arguments.
       *
       * Guarantees:
       * - Returns the branches of the repository if the action is "list".
       * - Throws an error if the action is "create", "switch", or "delete" without specifying a branch name.
       * - Updates the repository branch based on the action: creates, switches, or deletes the specified branch.
       *
       * @param args - The action and branch name for the Git operation.
       * @param exec - The execution context for running Git commands.
       */
      async execute(args, exec) {
        const path = workDir(args.path);
        const branch = await currentBranch(ctx, path, exec.signal);
        const [{ stdout: statusOut }, { stdout: untrackedOut }] = await Promise.all([
          runGit(ctx, path, ["status", "--porcelain=v1"], exec.signal),
          runGit(ctx, path, ["ls-files", "--others", "--exclude-standard"], exec.signal),
        ]);
        const staged: string[] = [];
        const unstaged: string[] = [];
        for (const line of statusOut.split("\n")) {
          if (line.length === 0) continue;
          const xy = line.slice(0, 2);
          const rest = line.length > 3 ? line.slice(3) : line;
          if (xy[0] !== " " && xy[0] !== "?") staged.push(rest.trim());
          if (xy[1] !== " ") unstaged.push(rest.trim());
        }
        const untracked = untrackedOut.split("\n").filter((line) => line.length > 0);
        return {
          path,
          branch: branch ?? undefined,
          detached: branch === null,
          staged,
          unstaged,
          untracked,
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "repo-branch",
      description: "List, create, switch, or delete git branches in a repository.",
      parameters: {
        path: {
          type: "string",
          description: "Working directory of the repository (defaults to the agent cwd).",
        },
        action: {
          type: "string",
          enum: ["list", "create", "switch", "delete"],
          required: true,
          description: "The branch operation to perform.",
        },
        name: { type: "string", description: "The branch name for create/switch/delete." },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", required: true },
            name: { type: "string" },
            current: { type: "string" },
            branches: { type: "array", items: { type: "string" }, required: true },
          },
        },
        render: (args, value) => [
          {
            type: "text",
            text:
              args.action === "list"
                ? `branches of the repo: ${value.branches.join(", ")}`
                : `${value.action} ${value.name} (current: ${value.current})`,
          },
        ],
      },
      /**
       * Applies one branch action in the repository, then lists its branches.
       *
       * @param args - The action, the branch name for a mutating action, and the path.
       * @param exec - The execution context carrying the abort signal.
       */
      async execute(args, exec) {
        const path = workDir(args.path);
        const action = args.action as string;
        const name = typeof args.name === "string" && args.name.length > 0 ? args.name : undefined;
        if (action !== "list" && name === undefined)
          throw new Error(`repos: repo-branch ${action} requires a branch name`);
        if (action === "create") await runGit(ctx, path, ["branch", name as string], exec.signal);
        if (action === "switch") await runGit(ctx, path, ["checkout", name as string], exec.signal);
        if (action === "delete")
          await runGit(ctx, path, ["branch", "-d", name as string], exec.signal);
        const { stdout: listOut } = await runGit(ctx, path, ["branch", "--list"], exec.signal);
        const branches = listOut
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => {
            const trimmed = line.trim();
            return trimmed.startsWith("* ") ? trimmed.slice(2) : trimmed;
          });
        const current = await currentBranch(ctx, path, exec.signal);
        return { action, name, current: current ?? undefined, branches };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "repo-commit",
      description: "Stage and commit the working tree of a repository, or commit specific paths.",
      parameters: {
        path: {
          type: "string",
          description: "Working directory of the repository (defaults to the agent cwd).",
        },
        message: { type: "string", required: true, description: "The commit message." },
        all: { type: "boolean", description: "Stage all tracked changes first (default true)." },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Specific paths to stage instead of everything.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            commit: { type: "string", required: true },
            summary: { type: "string", required: true },
            branch: { type: "string" },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `committed ${value.commit} on ${value.branch}: ${value.summary}`,
          },
        ],
      },
      /**
       * Stages the working tree — everything, or only the named paths — commits
       * it with the given message, and reports the new revision.
       *
       * @param args - The commit message, the stage mode, and the working directory.
       * @param exec - The execution context carrying the abort signal.
       */
      async execute(args, exec) {
        const path = workDir(args.path);
        const stageAll = args.all !== false;
        const paths = Array.isArray(args.paths)
          ? args.paths.filter((p): p is string => typeof p === "string")
          : [];
        if (paths.length > 0) {
          await runGit(ctx, path, ["add", "--", ...paths], exec.signal);
        } else if (stageAll) {
          await runGit(ctx, path, ["add", "-A"], exec.signal);
        }
        await runGit(ctx, path, ["commit", "-m", args.message], exec.signal);
        const { stdout: revOut } = await runGit(
          ctx,
          path,
          ["rev-parse", "--short", "HEAD"],
          exec.signal,
        );
        const { stdout: summaryOut } = await runGit(
          ctx,
          path,
          ["show", "--stat", "--format=%s", "HEAD"],
          exec.signal,
        );
        const branch = await currentBranch(ctx, path, exec.signal);
        return { commit: revOut, summary: summaryOut, branch: branch ?? undefined };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "repo-push",
      description:
        "Push the current branch (or a named branch) of a repository to its remote, authenticated with the vault GitHub token when required.",
      parameters: {
        path: {
          type: "string",
          description: "Working directory of the repository (defaults to the agent cwd).",
        },
        remote: {
          type: "string",
          description: "Remote name (defaults to the configured remote, usually origin).",
        },
        branch: {
          type: "string",
          description: "Branch to push (defaults to the current branch).",
        },
        force: {
          type: "boolean",
          description: "Force-push with lease (safe overwrite of the remote ref).",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            remote: { type: "string", required: true },
            branch: { type: "string", required: true },
            url: { type: "string", required: true },
          },
        },
        render: (args, value) => [
          { type: "text", text: `pushed ${value.branch} to ${value.remote} (${value.url})` },
        ],
      },
      /**
       * Pushes a branch to a remote, authenticated with the vault token and
       * defaulting the remote to the configured one.
       *
       * @param args - The working directory and the optional remote, branch, and force flags.
       * @param exec - The execution context carrying the abort signal.
       */
      async execute(args, exec) {
        const path = workDir(args.path);
        const remote =
          typeof args.remote === "string" && args.remote.length > 0
            ? args.remote
            : defaultRemote(config);
        const branch =
          typeof args.branch === "string" && args.branch.length > 0
            ? args.branch
            : await currentBranch(ctx, path, exec.signal);
        if (branch === null) throw new Error("repos: cannot push a detached HEAD");
        const token = await requiredToken(ctx);
        await runGit(
          ctx,
          path,
          [
            "-c",
            "http.extraHeader=Authorization: Bearer " + token,
            "push",
            ...(args.force === true ? ["--force-with-lease"] : []),
            remote,
            branch,
          ],
          exec.signal,
        );
        const { stdout: urlOut } = await runGit(
          ctx,
          path,
          ["remote", "get-url", remote],
          exec.signal,
        );
        return { remote, branch, url: urlOut };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "repo-pr",
      description:
        "Open a pull request for the current branch against the repository default branch, using the vault GitHub token.",
      parameters: {
        path: {
          type: "string",
          description: "Working directory of the repository (defaults to the agent cwd).",
        },
        title: { type: "string", required: true, description: "The pull request title." },
        body: { type: "string", description: "The pull request body (markdown)." },
        head: {
          type: "string",
          description: "The head branch (defaults to the current branch).",
        },
        base: {
          type: "string",
          description: "The base branch (defaults to the configured default, usually main).",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: { type: "string", required: true },
            ownerRepo: { type: "string", required: true },
            head: { type: "string", required: true },
            base: { type: "string", required: true },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `PR opened: ${value.url} (${value.head} -> ${value.base} in ${value.ownerRepo})`,
          },
        ],
      },
      /**
       * Opens a pull request from the current branch, defaulting the base branch
       * and remote to the configured ones.
       *
       * @param args - The pull request title, body, head, base, and working directory.
       * @param exec - The execution context carrying the abort signal.
       */
      async execute(args, exec) {
        const path = workDir(args.path);
        const head =
          typeof args.head === "string" && args.head.length > 0
            ? args.head
            : await currentBranch(ctx, path, exec.signal);
        if (head === null) throw new Error("repos: cannot open a PR from a detached HEAD");
        const base =
          typeof args.base === "string" && args.base.length > 0
            ? args.base
            : defaultBaseBranch(config);
        const remote = defaultRemote(config);
        const { stdout: urlOut } = await runGit(
          ctx,
          path,
          ["remote", "get-url", remote],
          exec.signal,
        );
        const ownerRepo = ownerRepoFromRemote(urlOut);
        if (ownerRepo === null)
          throw new Error(`repos: cannot determine owner/repo from remote ${urlOut}`);
        const token = await requiredToken(ctx);
        const url = await createPullRequest(token, {
          ownerRepo,
          head,
          base,
          title: args.title,
          ...(args.body !== undefined ? { body: args.body } : {}),
        });
        if (url === null) throw new Error("repos: GitHub did not return a pull-request URL");
        return { url, ownerRepo, head, base };
      },
    }),
  );
}

/**
 * Extract `owner/repo` from a git remote URL: `https://github.com/owner/repo`,
 * `git@github.com:owner/repo.git`, or `git://...`. Returns null for
 * non-GitHub remotes (file://, other hosts).
 */
export function ownerRepoFromRemote(remote: string): string | null {
  let rest: string | undefined;
  if (remote.startsWith("https://") || remote.startsWith("http://")) {
    const withoutScheme = remote.replace(/^https?:\/\//, "");
    const at = withoutScheme.indexOf("@");
    rest = at >= 0 ? withoutScheme.slice(at + 1) : withoutScheme;
  } else if (remote.includes("@")) {
    const at = remote.indexOf("@");
    rest = remote.slice(at + 1).replace(":", "/");
  } else if (remote.startsWith("git://")) {
    rest = remote.slice("git://".length);
  } else {
    return null;
  }
  const [host, ...pathParts] = rest.split("/");
  if (host !== "github.com") return null;
  const path = pathParts.join("/").replace(/\.git$/, "");
  const [owner, repo, ...extra] = path.split("/");
  if (owner === undefined || repo === undefined || extra.length > 0) return null;
  return `${owner}/${repo}`;
}

export { GitCommandError } from "./git.js";
