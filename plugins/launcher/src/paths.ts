import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of this package's root directory. */
export function packageDir(importMetaUrl: string): string {
  // src/paths.ts -> package root is one level up; lib/paths.js likewise.
  return dirname(dirname(fileURLToPath(importMetaUrl)));
}

/**
 * Locate the harness checkout: the DSH_HARNESS env var wins, else the
 * `DSH/` submodule of the enclosing KiKi checkout. Returns null when
 * no checkout is present (verbs that don't need the harness still work).
 */
export function findHarnessDir(env: NodeJS.ProcessEnv, pkgDir: string): string | null {
  const fromEnv = env.DSH_HARNESS;
  if (fromEnv !== undefined && fromEnv.length > 0 && existsSync(fromEnv)) return fromEnv;
  const sibling = join(pkgDir, "..", "..", "DSH");
  return existsSync(join(sibling, "apps")) ? sibling : null;
}

/**
 * Pick the harness CLI entrypoint: the built lib/bin.js when it exists, else
 * the TypeScript source run through tsx (dev fallback). Returns null when the
 * harness checkout has neither.
 *
 * The built entrypoint is preferred (#146) because the tsx route resolves
 * `tsx` from this repository's own node_modules -- coupling the global `dsh`
 * command's availability to this checkout's dev dependencies being intact,
 * so it breaks with a raw ERR_MODULE_NOT_FOUND during any reinstall.
 */
export function harnessCli(harnessDir: string): { bin: string; tsx: boolean } | null {
  const jsBin = join(harnessDir, "apps", "cli", "lib", "bin.js");
  if (existsSync(jsBin)) return { bin: jsBin, tsx: false };
  const tsBin = join(harnessDir, "apps", "cli", "src", "bin.ts");
  if (existsSync(tsBin)) return { bin: tsBin, tsx: true };
  return null;
}

/**
 * Whether the `tsx` package this checkout's node_modules would need to run
 * the dev-fallback CLI entrypoint is actually resolvable right now. Used to
 * fail with an actionable message (#146) instead of a raw module-resolution
 * stack trace when node_modules is mid-reinstall.
 */
export function tsxAvailable(pkgDir: string): boolean {
  return existsSync(join(pkgDir, "..", "..", "node_modules", "tsx"));
}

/**
 * Package-owned verb CLIs the launcher routes to, resolved as sibling
 * canonical packages of this one. The historical bash launcher pointed at a
 * `plugins/dsh-*` tree that no longer exists; these are the canonical owners.
 */
const VERB_BINS: Record<string, string> = {
  accounts: join("credential-vault", "bin", "accounts.mjs"),
  theme: join("themes", "bin", "theme.mjs"),
  lsp: join("lsp", "bin", "lsp.mjs"),
  formatter: join("formatters", "bin", "formatter.mjs"),
  agents: join("agents", "bin", "agents.mjs"),
};

/** Resolve the CLI bin owning a package verb, or null when it isn't installed. */
export function verbBin(pkgDir: string, verb: string): string | null {
  const rel = VERB_BINS[verb];
  if (rel === undefined) return null;
  const bin = join(pkgDir, "..", rel);
  return existsSync(bin) ? bin : null;
}
