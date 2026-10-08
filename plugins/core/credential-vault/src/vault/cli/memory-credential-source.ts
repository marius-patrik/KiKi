import type { CredentialSource, KeychainItem, SourcePlatform } from "./credential-source.js";

/** A source backed by literals. The fixture every detector test is written against. */
export class MemorySource implements CredentialSource {
  readonly machine: string;
  readonly platform: SourcePlatform;
  readonly home: string;
  readonly #files: Map<string, string>;
  readonly #keychain: Map<string, string>;
  readonly #items: KeychainItem[];
  readonly #env: Record<string, string>;

  /** Constructs an instance. */
  constructor(options: {
    machine?: string;
    platform?: SourcePlatform;
    home?: string;
    files?: Record<string, string>;
    keychain?: Record<string, string>;
    keychainItems?: KeychainItem[];
    environment?: Record<string, string>;
  }) {
    this.machine = options.machine ?? "fixture";
    this.platform = options.platform ?? "darwin";
    this.home = (options.home ?? "/home/fixture").replace(/\/$/, "");
    this.#files = new Map(Object.entries(options.files ?? {}));
    this.#keychain = new Map(Object.entries(options.keychain ?? {}));
    this.#items =
      options.keychainItems ??
      Object.keys(options.keychain ?? {}).map((service) => ({ service, account: null }));
    this.#env = options.environment ?? {};
  }

  /** readFile implementation. */
  async readFile(file: string): Promise<string | null> {
    return this.#files.get(file) ?? null;
  }

  /** listDirectory implementation. */
  async listDirectory(directory: string): Promise<string[]> {
    const prefix = `${directory.replace(/\/$/, "")}/`;
    return [...this.#files.keys()]
      .filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"))
      .map((file) => file.slice(prefix.length));
  }

  /** keychainItems implementation. */
  async keychainItems(): Promise<KeychainItem[]> {
    return [...this.#items];
  }

  /** keychainSecret implementation. */
  async keychainSecret(service: string): Promise<string | null> {
    return this.#keychain.get(service) ?? null;
  }

  /** environment implementation. */
  async environment(): Promise<Record<string, string>> {
    return { ...this.#env };
  }
}
