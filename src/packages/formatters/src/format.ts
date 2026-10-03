/**
 * Core formatting: run one configured formatter command over a target file
 * through `ctx.subprocess`, returning the before/after text. Both the model
 * `format` tool and the auto-format-on-edit hook share this path, so the
 * presentation (`{ path, before, after }`) is consistent everywhere.
 * @module formatters/format
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-subprocess";
import type { FsTarget } from "@deepseek-ai/dsh-fs";
import type { FormatterCommandView } from "./settings.js";
import { dirname } from "node:path";

/** The model-facing formatting outcome shared by the tool and the hook. */
export interface FormatOutcome {
  /** Backend-resolved path of the formatted file. */
  path: string;
  /** File content before formatting. */
  before: string;
  /** File content after formatting. */
  after: string;
}

/** Extend to match tools with a file path in snake_case (`file_path`) or camelCase (`filePath`). */
export function targetPathFromArguments(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const record = args as Record<string, unknown>;
  const candidate =
    typeof record.file_path === "string"
      ? record.file_path
      : typeof record.filePath === "string"
        ? record.filePath
        : typeof record.path === "string"
          ? record.path
          : undefined;
  return candidate;
}

/**
 * Resolve the backend target for a model-facing path, reusing the caller's
 * signal; undefined when the path is absent or unreadable.
 */
export async function resolveTarget(
  ctx: Context,
  path: string,
  signal?: AbortSignal,
): Promise<FsTarget | undefined> {
  try {
    return await ctx.fs.resolve(path, { cwd: process.cwd() });
  } catch {
    return undefined;
  }
}

/**
 * Format one file in place. The formatter runs over the resolved target (never
 * shell-interpreted); exit code 0 yields the reformatted file. A nonzero exit
 * or a failed spawn leaves the file untouched and surfaces as an error.
 * @param ctx - the plugin context carrying `fs` and `subprocess`.
 * @param target - the resolved file target to format in place.
 * @param command - the configured formatter command, read from the live
 *   formatter table (argv[0] is the executable), so it is a frozen snapshot.
 * @param signal - aborts the subprocess.
 * @returns the before/after outcome.
 */
export async function formatFile(
  ctx: Context,
  target: FsTarget,
  command: FormatterCommandView,
  signal?: AbortSignal,
): Promise<FormatOutcome> {
  const path = target.displayPath;
  const before = await ctx.fs.readText(target, signal);
  const spawn = await ctx.subprocess.spawn({
    argv: [...command.argv, path],
    cwd: dirname(path),
    stdio: {
      stdin: { data: "" },
      stdout: { maxBytes: 256_000 },
      stderr: { maxBytes: 256_000 },
    },
    graceMs: 15_000,
    signal,
  });
  const outcome = await spawn.done;
  if (outcome.exitCode !== 0) {
    const errTail = spawn.collected.stderr?.readFrom(0).text ?? "";
    throw new Error(`formatter ${command.argv[0] ?? "?"} exited ${outcome.exitCode}: ${errTail}`);
  }
  const after = await ctx.fs.readText(target, signal);
  return { path, before, after };
}
