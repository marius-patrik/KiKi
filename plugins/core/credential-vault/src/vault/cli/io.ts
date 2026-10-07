/**
 * The process seam every CLI command touches outside the vault. Injected rather
 * than reached for, because half of what this module has to be trusted about —
 * that it does not print a secret, that it refuses a terminal — is only testable
 * when the terminal and the streams are supplied by the test.
 */
export interface VaultCliIo {
  out(text: string): void;
  err(text: string): void;
  /** Reads all of stdin. Rejects when stdin is a terminal: material must be piped. */
  readStdin(): Promise<string>;
  /** Whether `out` is going to a terminal, which is what `get` refuses to write to. */
  isTty: boolean;
  env: Record<string, string | undefined>;
  home: string;
  now(): number;
}

/**
 * Provides CLI input/output operations for the vault.
 *
 * Returns an object with methods to write to stdout/stderr, read from stdin,
 * check if the output is a terminal, access environment variables, and get the current time.
 * Throws an error if secret material is typed into a terminal.
 */
export function defaultVaultCliIo(): VaultCliIo {
  return {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    readStdin: async () => {
      if (process.stdin.isTTY)
        throw new Error("secret material must be piped in, not typed at a terminal");
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    },
    isTty: Boolean(process.stdout.isTTY),
    env: { ...process.env },
    home: process.env.HOME ?? process.env.USERPROFILE ?? "",
    now: () => Date.now(),
  };
}
