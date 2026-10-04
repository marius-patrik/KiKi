/**
 * Owner-only file publication for the vault, and for anything else in the
 * engine that puts a secret on disk.
 *
 * `src/cli/state-v2.ts` already has a hardened `writeTextAtomic`, and
 * `credentials.ts` has its own private copy of the same idea. This is a third,
 * and the reason is layering rather than oversight: `src/engine` takes its
 * authority by injection and does not import from `src/cli`, and the helpers in
 * `credentials.ts` are module-private in a file this slice must not modify. The
 * behaviour is deliberately identical to `credentials.ts` — same temp-file
 * naming, same Windows rename retry, same 0600 over 0700 — so the two cannot
 * drift into different durability guarantees.
 *
 * Two guarantees, and the second is the one that is easy to lose:
 *
 * - **Atomicity.** A reader either sees the previous complete file or the next
 *   complete file. A crash mid-write leaves a stray `.tmp` and an intact vault,
 *   never a truncated record.
 * - **The mode is never wider than intended, at any instant.** Not "is narrowed
 *   afterwards" — never wider, ever. `writeFile(to, bytes)` followed by
 *   `chmod(to, 0o600)` produces a correct *final* mode and a file that was
 *   world-readable for the whole of the write, which is long enough for a
 *   `kqueue`/`inotify` watcher to `open()` it; the fd it gets that way survives
 *   the `chmod`, because a mode change does not revoke an open descriptor. So
 *   the mode is set by the `open()` that creates the file, on a temp name that
 *   is not the published one, and the file reaches its real name already
 *   correct. `publishFileAtMode` is the only place in the engine that writes a
 *   file whose contents are a secret; `clis/import.ts` copies credentials
 *   through it for exactly this reason.
 * @module credentials/vault/files
 */

import path from "node:path";
import { chmod, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const WINDOWS_TRANSIENT_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);

/** exists implementation. */
export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the directory exists with private permissions and writes the file with the specified mode.
 *
 * The caller must guarantee the directory exists with the correct permissions before calling this function.
 * This function will create the directory if it does not exist, setting the mode to 0o700 on non-Windows platforms.
 * It then writes the file with the specified mode, ensuring no wider permissions are applied.
 *
 * @param directory - The directory path to ensure exists with private permissions.
 */
export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
}

/** Write 0600, publishing through a rename so a reader never sees a partial file. */
export async function writePrivateFile(file: string, content: string): Promise<void> {
  await ensurePrivateDirectory(path.dirname(file));
  await publishFileAtMode(file, content, 0o600);
}

/**
 * Publish `content` at `file` with exactly `mode`, and never wider than `mode`
 * at any point.
 *
 * The caller owns the destination directory: nothing here creates or re-modes
 * it, because a caller that is reproducing a source tree's modes (the CLI
 * import) needs its own directory modes left alone, and one that is writing
 * into the vault has already called `ensurePrivateDirectory`.
 *
 * The `chmod` happens on the temp name, before publication, rather than on the
 * destination afterwards. It is needed at all only because `open(…, mode)`
 * subtracts the umask, so a 0644 target under umask 077 would arrive at 0600;
 * the `chmod` restores the exact recorded mode. Doing it while the file is
 * still anonymous means the widening — when there is one — is never observable
 * at the published path, so no watcher can catch the destination in an
 * intermediate state. It is deliberately not skipped on Windows: there `chmod`
 * carries only the read-only attribute, and dropping it would stop a read-only
 * source file from being copied as read-only, which `verifyImport` compares.
 */
export async function publishFileAtMode(
  file: string,
  content: string | Uint8Array,
  mode: number,
): Promise<void> {
  const temporary = temporaryName(file);
  try {
    await writeExactly(temporary, content, mode);
    await chmod(temporary, mode);
    await replaceFile(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** As `writePrivateFile`, but returns false when the destination already exists. */
export async function writePrivateFileExclusive(file: string, content: string): Promise<boolean> {
  await ensurePrivateDirectory(path.dirname(file));
  let handle;
  try {
    handle = await open(file, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (process.platform !== "win32") await chmod(file, 0o600);
  return true;
}

/**
 * Generates a temporary name for a file by appending a unique identifier based on the process ID and a random UUID.
 * Guarantees a unique temporary file name in the same directory as the given file.
 *
 * @param file - The original file path to generate the temporary name for.
 * @returns A temporary file name as a string.
 */
function temporaryName(file: string): string {
  return path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
}

/**
 * Replace the destination in one namespace operation. On Windows a scanner or
 * indexer holding the destination open turns a valid replacement into a
 * transient error, so retry briefly there rather than fail a vault write.
 */
async function replaceFile(temporary: string, file: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(temporary, file);
    return;
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= 9 || !WINDOWS_TRANSIENT_RENAME_ERRORS.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(160, 10 * 2 ** attempt)));
    }
  }
}

/**
 * Create `file` at `mode` and put `content` in it, or fail.
 *
 * `wx` rather than `w` so the mode argument is honoured — `open` applies it
 * only when it creates the file, and a pre-existing name would otherwise be
 * written through at whatever mode it already had, including one an attacker
 * chose. With a pid+UUID temp name an `EEXIST` here means something is wrong,
 * and failing is the right answer.
 */
async function writeExactly(
  file: string,
  content: string | Uint8Array,
  mode = 0o600,
): Promise<void> {
  const handle = await open(file, "wx", mode);
  try {
    if (typeof content === "string") await handle.writeFile(content, "utf8");
    else await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
