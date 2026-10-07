/**
 * Contract types for the dsh account vault.
 * @module credentials/types
 */

/**
 * One resolved secret and the layer that supplied it. Resolution ranks the
 * encrypted vault first, then the harness credential seam (`ctx.credentials`),
 * so a value explicitly stored in the vault always shadows an ambient value.
 */
export interface ResolvedSecret {
  value: string;
  origin: "vault" | "credentials";
}

/**
 * A file-based secret importer. Providers recognize one tool's credential
 * file (Claude Code's `.credentials.json`, Cursor's `state.vscdb`) and read
 * the raw secret values out of it; the account service stores those values
 * into the vault under their canonical reference names.
 */
export interface FileSecretProvider {
  /** Stable provider id, used to address it in `importFile` disambiguation. */
  id: string;
  /** Human name shown by configuration surfaces. */
  displayName: string;
  /** Short explanation of where the values come from. */
  description: string;
  /** Default file paths the provider is willing to read, in preference order. */
  defaultPaths: string[];
  /** Whether `path` looks like this provider's file (cheap check, no value reads). */
  detect(path: string): Promise<boolean>;
  /** Read every known secret from `path`; returns ref → value pairs (empty values dropped). */
  read(path: string): Promise<Record<string, string>>;
}

/** One reference stored into the vault by an import. */
export interface ImportResult {
  ref: string;
  provider: string;
  source: string;
}

/**
 * The account seam (`ctx.accounts`): a write-first encrypted vault that
 * resolves before the harness credential seam. `set`/`unset` touch the vault
 * only — ambient values are read through, never promoted.
 */
export interface AccountsServiceLike {
  /** Resolve a reference, vault first, then the harness credential seam. */
  resolve(ref: string): Promise<ResolvedSecret | undefined>;
  /** Durably store a non-empty value in the vault. */
  set(ref: string, value: string): Promise<void>;
  /** Remove a reference from the vault; an absent reference is a no-op. */
  unset(ref: string): Promise<void>;
  /** All references currently stored in the vault, sorted. */
  list(): Promise<string[]>;
  /** Register a file-based importer. */
  registerFileProvider(provider: FileSecretProvider): void;
  /** The registered importers. */
  getFileProviders(): FileSecretProvider[];
  /** Absolute path of the vault document. */
  vaultPath(): string;
  /** Every stored record's canonical reference and its named account, material stripped. */
  accounts(): Promise<
    Array<{
      ref: string;
      account: string | null;
      kind: string;
      purpose: string;
      label: string;
      expiresAt: string | null;
    }>
  >;
  /** Import every recognized secret from `path` into the vault. */
  importFile(path: string): Promise<ImportResult[]>;
}
