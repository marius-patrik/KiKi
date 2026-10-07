#!/usr/bin/env node
/**
 * The `dsh accounts` command: the owner surface over the same vault
 * `ctx.accounts` serves.
 *
 * The vault service keys records with the v1 bootstrap — the macOS Keychain
 * `dsh.accounts` entry with the `<home>/accounts.key` file as fallback — while
 * the ported CLI resolves its master key from `master.key` (base64) in the
 * vault directory. This wrapper is the bridge: it derives the CLI key file
 * from the service key (exclusively, so a deliberately separate vault is never
 * clobbered), points `ANDROMEDA_VAULT_DIR` at the service vault, and then runs
 * the CLI untouched. Run `dsh accounts init` once to write the vault config
 * the read commands require.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { loadOrCreateKey } from "../lib/vault.js";
import { vaultCommand } from "../lib/vault/cli.js";
import { vaultDirectory } from "../lib/vault/store.js";

const home = resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
const vaultDir = resolve(process.env.ANDROMEDA_VAULT_DIR ?? vaultDirectory(home));

await mkdir(vaultDir, { recursive: true });
const keyFile = join(vaultDir, "master.key");
try {
  const key = Buffer.from(await loadOrCreateKey(join(home, "accounts.key")));
  await writeFile(keyFile, `${key.toString("base64")}\n`, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}

const code = await vaultCommand(process.argv.slice(2), {
  env: { ...process.env, ANDROMEDA_VAULT_DIR: vaultDir },
});
process.exitCode = code;
