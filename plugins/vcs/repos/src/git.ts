/**
 * Thin `git` runner over `ctx.subprocess`. Everything repos does with the
 * working tree goes through `runGit`, so the whole plugin shares one spawn
 * shape: collect-mode stdio, a sane stdout cap, and a nonzero-exit policy that
 * surfaces the stderr tail instead of silent empty results. Commands are never
 * shell-interpreted.
 * @module repos/git
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-subprocess";

/** The outcome of one git command: exit code, stdout, and stderr tails. */
export interface GitOutcome {
  /** Process exit code; nonzero means the command failed. */
  code: number;
  /** Trimmed stdout of the command. */
  stdout: string;
  /** Trimmed stderr of the command (what the error message is built from). */
  stderr: string;
}

/**
 * Run one git command in a working directory and resolve with its output.
 * Nonzero exits reject with a `GitCommandError` carrying the stderr tail.
 * @param ctx - the plugin context carrying `subprocess`.
 * @param cwd - the repository directory to run in.
 * @param args - the git command, `argv[0]` is the subcommand (e.g. `['rev-parse', '--abbrev-ref', 'HEAD']`).
 * @param signal - aborts the subprocess.
 * @returns the command's exit code, stdout, and stderr.
 */
export async function runGit(
  ctx: Context,
  cwd: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<GitOutcome> {
  const spawn = await ctx.subprocess.spawn({
    argv: ["git", ...args],
    cwd,
    stdio: {
      stdin: { data: "" },
      stdout: { maxBytes: 256_000 },
      stderr: { maxBytes: 256_000 },
    },
    graceMs: 30_000,
    signal,
  });
  const outcome = await spawn.done;
  const stdout = spawn.collected.stdout?.readFrom(0).text ?? "";
  const stderr = spawn.collected.stderr?.readFrom(0).text ?? "";
  if (outcome.exitCode !== 0) {
    throw new GitCommandError(args, outcome.exitCode ?? -1, stderr.trim());
  }
  return { code: outcome.exitCode ?? 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** A git command that exited nonzero. */
export class GitCommandError extends Error {
  readonly command: string[];
  readonly exitCode: number;

  /** Constructs an instance. */
  constructor(command: readonly string[], exitCode: number, stderr: string) {
    super(`git ${command.join(" ")} exited ${exitCode}${stderr.length > 0 ? `: ${stderr}` : ""}`);
    this.name = "GitCommandError";
    this.command = [...command];
    this.exitCode = exitCode;
  }
}

/**
 * The current branch name, or `null` in a detached HEAD state.
 * @returns the branch name, or null when HEAD is detached.
 */
export async function currentBranch(
  ctx: Context,
  cwd: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const { stdout } = await runGit(ctx, cwd, ["branch", "--show-current"], signal);
  return stdout.length > 0 ? stdout : null;
}
