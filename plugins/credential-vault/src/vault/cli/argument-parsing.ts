/** A fault the owner can fix by retyping the command. Reported without a stack. */
export class VaultCliError extends Error {
  /** Constructs an instance. */
  constructor(message: string) {
    super(message);
    this.name = "VaultCliError";
  }
}

export interface ParsedArguments {
  positional: readonly string[];
  /** Repeatable by design: `--agent` and `--tag` are lists. */
  options: ReadonlyMap<string, readonly string[]>;
  booleans: ReadonlySet<string>;
}

/**
 * `--name value`, `--name=value`, and bare `--name`. Deliberately small: the
 * commands here take no secret material on argv, so there is nothing subtle for
 * a parser to get wrong, and a hand-rolled twenty lines is easier to audit than
 * a dependency.
 */
export function parseVaultArguments(argv: readonly string[]): ParsedArguments {
  const positional: string[] = [];
  const options = new Map<string, string[]>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf("=");
    if (equals !== -1) {
      push(options, body.slice(0, equals), body.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      booleans.add(body);
      continue;
    }
    push(options, body, next);
    index += 1;
  }
  return { positional, options, booleans };
}

/**
 * Ensures the specified key in the map has an array of strings, appending the given value to it.
 * If the key does not exist, it creates a new array with the given value.
 * Throws a VaultCliError if the key is required but not provided.
 *
 * @param map - The map to update.
 * @param key - The key under which to store the value.
 * @param value - The value to add to the array.
 */
function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** optional implementation. */
export function optional(args: ParsedArguments, name: string): string | null {
  return args.options.get(name)?.at(-1) ?? null;
}

/**
 * Retrieves a list of values associated with the given name from the options.
 * Returns an empty array if the name is not found.
 * Throws a VaultCliError if the name is required but not provided.
 *
 * @param args - The parsed command-line arguments.
 * @param name - The name of the option to retrieve.
 * @returns An array of strings for the given option name.
 */
export function many(args: ParsedArguments, name: string): string[] {
  return [...(args.options.get(name) ?? [])];
}

/**
 * Retrieves a value associated with the given name from the options.
 * Throws a VaultCliError if the name is required but not provided.
 *
 * @param args - The parsed command-line arguments.
 * @param name - The name of the required option to retrieve.
 * @returns The string value for the given option name.
 */
export function required(args: ParsedArguments, name: string): string {
  const value = optional(args, name);
  if (!value) throw new VaultCliError(`--${name} is required`);
  return value;
}

/**
 * Retrieves a value associated with the given name from the options.
 * Returns undefined if the name is not found and optional is used.
 * Throws a VaultCliError if the name is required but not provided.
 *
 * @param args - The parsed command-line arguments.
 * @param name - The name of the option to retrieve.
 * @returns The string value for the given option name or undefined if optional and not found.
 */
export function boolean(args: ParsedArguments, name: string): boolean {
  return args.booleans.has(name) || optional(args, name) === "true";
}
