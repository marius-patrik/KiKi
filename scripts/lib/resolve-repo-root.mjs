/**
 * Resolves the repository root from a script's own `import.meta.url`,
 * assuming the caller lives at `scripts/<name>.mjs` or `scripts/lib/<name>.mjs`.
 *
 * @module @dsh-stack/scripts/lib/resolve-repo-root
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveRepoRoot(importMetaUrl) {
  return join(dirname(fileURLToPath(importMetaUrl)), "..");
}
