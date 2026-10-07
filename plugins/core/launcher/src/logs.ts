import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { createReadStream } from "node:fs";

/**
 * Read the last `lines` lines of the log file. Returns null when the log does
 * not exist yet.
 */
export function readLogTail(logFile: string, lines: number): string | null {
  if (!existsSync(logFile)) return null;
  const text = readFileSync(logFile, "utf8");
  const all = text.split("\n");
  // A trailing newline leaves an empty final element; drop it for counting.
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  return `${all.slice(-lines).join("\n")}\n`;
}

/**
 * Print the tail of the log, then stream appended content until the returned
 * stop function is called (or the process is interrupted). Replaces the bash
 * launcher's `tail -f` with fs.watch so following works without a platform
 * `tail` binary. Returns null when the log file does not exist yet — nothing
 * is being followed, so there is nothing to stop.
 */
export function followLog(
  logFile: string,
  lines: number,
  out: (text: string) => void,
): (() => void) | null {
  const tail = readLogTail(logFile, lines);
  if (tail === null) {
    out(`dsh: no log file found at ${logFile}\n`);
    return null;
  }
  out(tail);
  let offset = statSync(logFile).size;
  const watcher = watch(logFile, () => {
    const size = statSync(logFile).size;
    if (size < offset) offset = 0; // log rotated/truncated: start over
    if (size === offset) return;
    const stream = createReadStream(logFile, { start: offset, end: size - 1 });
    stream.on("data", (chunk) => out(chunk.toString()));
    stream.on("end", () => {
      offset = size;
    });
  });
  return () => watcher.close();
}
