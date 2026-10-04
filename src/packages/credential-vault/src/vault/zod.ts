/**
 * A minimal zod-compatible surface over `@deepseek-ai/schemastery`, so vault
 * code ported from Andromeda keeps the validation semantics it was written
 * against without a zod dependency.
 *
 * Three behaviors differ between zod and schemastery, and this shim restores
 * the zod ones:
 *
 * - `strictObject` rejects unknown keys. schemastery's `object` strips or
 *   merges them; the vault's metadata schema deliberately fails closed on a
 *   scope typo, so unknown keys must be an error, not a drop.
 * - `safeParse` reports every failing path at once. schemastery throws on the
 *   first failure; `parseSecretMetadata` documents that it reports every
 *   failing field path, and `safeParse` here aggregates them.
 * - `enum`/`refine`/`regex` exist. schemastery has neither an enum builder nor
 *   a refine step, and spells regex `pattern`; the ported schemas use the zod
 *   spellings, so they are mapped onto union / a custom validation step /
 *   pattern.
 *
 * `.refine` is a registered schemastery schema *type* rather than a transform,
 * because schemastery invokes transform callbacks with a single argument — the
 * threaded `options` (and therefore the validation path) never reaches them.
 * A custom type's resolver does receive `options`, so refine failures report
 * the same dotted path zod would.
 * @module credentials/vault/zod
 */

import _z from "@deepseek-ai/schemastery";

type Schema<S = any, T = S> = Schemastery<S, T>;
type Dict = Record<string, unknown>;
type TypeT<X> = Schemastery.TypeT<X>;
type Options = Schemastery.Options;

/** One validation problem, shaped like a zod issue. */
export interface ZodIssue {
  path: (string | number)[];
  message: string;
}

/** The required-key output of a `strictObject` (zod semantics: all keys present). */
type StrictObjectT<X extends Dict> = { [K in keyof X]: TypeT<X[K]> };

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ZodIssue[] } };

/* -------------------------------------------------------------------------- */
/* Custom schema types                                                          */
/* -------------------------------------------------------------------------- */

/** isPlainObject implementation. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Unknown keys are rejected; every declared key is required unless nullable. */
_z.extend("strictObject", (data, schema, options) => {
  if (!isPlainObject(data)) throw new _z.ValidationError("expected object", options);
  const result: Record<string, unknown> = {};
  for (const key in schema.dict!) {
    if (!(key in data) || data[key] === undefined) {
      throw new _z.ValidationError("missing required field", {
        ...options,
        path: [...(options.path ?? []), key],
      });
    }
    const [value] = _z.resolve(data[key], schema.dict![key]!, {
      ...options,
      path: [...(options.path ?? []), key],
    });
    result[key] = value;
  }
  for (const key in data) {
    if (!(key in schema.dict!)) {
      throw new _z.ValidationError("unexpected key", {
        ...options,
        path: [...(options.path ?? []), key],
      });
    }
  }
  return [result];
});

/** Validate the inner schema, then run the refinement; the path is threaded. */
_z.extend("refine", (data, schema, options) => {
  const refined = schema as unknown as { check?: (value: unknown) => boolean; message?: string };
  const [value] = _z.resolve(data, schema.inner!, options);
  const passes = refined.check?.(value);
  if (!passes) throw new _z.ValidationError(refined.message ?? "value is invalid", options);
  return [value];
});

/* -------------------------------------------------------------------------- */
/* Instance methods (zod spellings over schemastery primitives)                 */
/* -------------------------------------------------------------------------- */

Object.assign(_z.prototype, {
  /** nullable implementation. */
  nullable(this: Schema): Schema {
    return _z.union([this, _z.const(null)]) as Schema;
  },
  /**
   * Ensures the schema is read-only, preventing modifications.
   *
   * Returns the same schema object, indicating it is now read-only.
   *
   * @returns The same schema object, signifying it cannot be modified.
   */
  readonly(this: Schema): Schema {
    return this;
  },
  /** regex implementation. */
  regex(this: Schema, regexp: RegExp): Schema {
    return this.pattern(regexp) as Schema;
  },
  /** refine implementation. */
  refine(this: Schema, check: (value: unknown) => boolean, options?: { message?: string }): Schema {
    return _z({
      type: "refine",
      inner: this,
      check,
      message: options?.message ?? "value is invalid",
    } as unknown as Partial<Schema>) as Schema;
  },
  /** safeParse implementation. */
  safeParse(this: Schema, value: unknown): SafeParseResult<unknown> {
    const issues = collectIssues(this, value, []);
    if (issues.length > 0) return { success: false, error: { issues } };
    try {
      return { success: true, data: _z.resolve(value, this, {})[0] };
    } catch (error) {
      return {
        success: false,
        error: {
          issues: [{ path: [], message: error instanceof Error ? error.message : String(error) }],
        },
      };
    }
  },
});

declare global {
  interface Schemastery<S, T> {
    /** Accept null in addition to the schema's own values (zod's `.nullable()`). */
    nullable(): Schemastery<S | null, T | null>;
    /** No-op at runtime; marks the input/output as readonly (zod's `.readonly()`). */
    readonly(): Schemastery<Readonly<S>, Readonly<T>>;
    /** Require strings to match a regular expression (zod's `.regex()`). */
    regex(regexp: RegExp): Schemastery<S, T>;
    /** Validate, then run `check`; a false result fails with `message`. */
    refine(check: (value: T) => boolean, options?: { message?: string }): Schemastery<S, T>;
    /** Validate without throwing, reporting every failing path. */
    safeParse(value: unknown): SafeParseResult<T>;
  }
}

/* -------------------------------------------------------------------------- */
/* Static builders                                                              */
/* -------------------------------------------------------------------------- */

/** strictObject implementation. */
export function strictObject<X extends Dict>(dict: X): Schema<StrictObjectT<X>, StrictObjectT<X>> {
  const schema = _z.object(dict) as Schema;
  schema.type = "strictObject";
  return schema;
}

/** enumOf implementation. */
export function enumOf<const T extends readonly string[]>(values: T): Schema<T[number], T[number]> {
  return _z.union(values.map((value) => _z.const(value))) as unknown as Schema<
    T[number],
    T[number]
  >;
}

export interface ZodStatic extends Schemastery.Static {
  strictObject: typeof strictObject;
  enum: typeof enumOf;
}

/** The augmented schemastery default: zod-compatible additions merged in. */
export const z: ZodStatic = Object.assign(_z, { strictObject, enum: enumOf }) as ZodStatic;

export namespace z {
  /** The output type of a schema, as zod's `z.infer` exposes it. */
  export type infer<S extends Schema = Schema> = S extends Schema<infer _In, infer Out>
    ? Out
    : never;
  /** Alias of `infer`, for readers used to zod's `TypeOf`. */
  export type TypeOf<S extends Schema = Schema> = S extends Schema<infer _In, infer Out>
    ? Out
    : never;
}

/* -------------------------------------------------------------------------- */
/* Aggregated issue collection for `safeParse`                                  */
/* -------------------------------------------------------------------------- */

/** collectIssues implementation. */
function collectIssues(schema: Schema, data: unknown, path: (string | number)[]): ZodIssue[] {
  const type = schema.type;
  if (type === "strictObject" || type === "object") {
    if (!isPlainObject(data)) return [{ path, message: "expected object" }];
    const issues: ZodIssue[] = [];
    for (const key in schema.dict!) {
      const inner = schema.dict![key]!;
      if (!(key in data) || data[key] === undefined) {
        issues.push({ path: [...path, key], message: "missing required field" });
      } else {
        issues.push(...collectIssues(inner, data[key], [...path, key]));
      }
    }
    if (type === "strictObject") {
      for (const key in data) {
        if (!(key in schema.dict!))
          issues.push({ path: [...path, key], message: "unexpected key" });
      }
    }
    return issues;
  }
  if (type === "array") {
    if (!Array.isArray(data)) return [{ path, message: "expected array" }];
    const issues: ZodIssue[] = [];
    data.forEach((item, index) => {
      issues.push(...collectIssues(schema.inner!, item, [...path, index]));
    });
    return issues;
  }
  if (type === "union") {
    for (const inner of schema.list!) {
      if (collectIssues(inner, data, path).length === 0) return [];
    }
    return [{ path, message: `expected ${schema.toString()}` }];
  }
  if (type === "refine") {
    const refined = schema as unknown as { check?: (value: unknown) => boolean; message?: string };
    const innerIssues = collectIssues(schema.inner!, data, path);
    if (innerIssues.length > 0) return innerIssues;
    let passes = false;
    try {
      passes = Boolean(refined.check?.(data));
    } catch {
      passes = false;
    }
    if (passes) return [];
    return [{ path, message: refined.message ?? "value is invalid" }];
  }
  try {
    _z.resolve(data, schema, { path });
    return [];
  } catch (error) {
    return [{ path, message: leafMessage(error as Error) }];
  }
}

/** Strip schemastery's `$a.b.c` prefix so the message is the failure itself. */
function leafMessage(error: Error): string {
  if (error instanceof _z.ValidationError) {
    const path = error.options?.path ?? [];
    let prefix = "$";
    for (const segment of path) {
      prefix += typeof segment === "string" ? `.${segment}` : `[${String(segment)}]`;
    }
    const message = error.message;
    if (prefix !== "$" && message.startsWith(`${prefix} `)) return message.slice(prefix.length + 1);
    return message;
  }
  return error.message;
}

export type { Options };
