/**
 * Runs one `gh` command and returns its stdout.
 *
 * Project writes need a token with Projects scope while repository reads use
 * the ambient workflow token, so the token is a per-call argument rather than
 * ambient process state.
 *
 * @module @dsh-stack/scripts/run-gh
 */
import { execFileSync } from "node:child_process";

/**
 * Invokes `gh` with the given arguments.
 *
 * @param {string[]} args - Arguments passed to `gh`.
 * @param {string} [token] - Token to authenticate this call, when it differs
 *   from the ambient `GH_TOKEN`.
 * @returns {string} The command's stdout.
 * @throws When `gh` exits non-zero.
 */
export function runGh(args, token) {
  return execFileSync("gh", args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    env: token ? { ...process.env, GH_TOKEN: token } : process.env,
  });
}
