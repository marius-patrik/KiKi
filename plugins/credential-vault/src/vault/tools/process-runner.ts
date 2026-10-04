import { spawn } from "node:child_process";

export interface ProcessSpec {
  command: string;
  args: readonly string[];
  cwd: string | null;
  /** Complete child environment. Not merged with the parent's — see `runAuthenticatedProcess`. */
  env: Record<string, string>;
}

export interface ProcessOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Child-process seam, injected for the same reason as the transport. */
export type ProcessRunner = (spec: ProcessSpec) => Promise<ProcessOutcome>;

/**
 * Child processes over `node:child_process`, with the environment taken exactly
 * as given. `shell` is never enabled: the arguments are passed as an array so
 * nothing an agent supplies can become shell syntax.
 */
export function nodeProcessRunner(options: { maxOutputBytes?: number } = {}): ProcessRunner {
  const limit = options.maxOutputBytes ?? 1_000_000;
  return async (spec) =>
    new Promise<ProcessOutcome>((resolve, reject) => {
      const child = spawn(spec.command, [...spec.args], {
        cwd: spec.cwd ?? undefined,
        env: spec.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < limit) stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < limit) stderr += chunk.toString("utf8");
      });
      // The error is rebuilt rather than forwarded: a spawn failure from Node
      // carries the whole spawn descriptor, and the descriptor holds the
      // credential this runner was given.
      child.on("error", () => reject(new Error(`could not run ${spec.command}`)));
      child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
    });
}
