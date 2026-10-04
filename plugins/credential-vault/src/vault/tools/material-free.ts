import type { SecretValue } from "../secret.js";
import type { SecretMaterial, SecretRecord } from "../record.js";
import type { TotpParameters } from "../totp.js";

/** Everything in this codebase that is, or transitively holds, secret material. */
type SecretBearing = SecretValue | SecretRecord | SecretMaterial | TotpParameters;

/**
 * Whether `T` can carry secret material anywhere inside it. Functions count:
 * a closure is a perfectly good way to smuggle a `reveal()` past a shape check.
 */
export type CarriesMaterial<T> = [T] extends [never]
  ? false
  : T extends SecretBearing
    ? true
    : T extends (...args: never[]) => unknown
      ? true
      : T extends readonly (infer Element)[]
        ? CarriesMaterial<Element>
        : T extends object
          ? true extends { [K in keyof T]-?: CarriesMaterial<T[K]> }[keyof T]
            ? true
            : false
          : false;

/**
 * `T`, but only when nothing in it can hold material; `never` otherwise.
 *
 * Every tool declares its return type through this, so adding a secret-bearing
 * field to a result is a compile error at the `return` statement rather than a
 * leak somebody notices in a transcript six weeks later.
 */
export type MaterialFree<T> = CarriesMaterial<T> extends false ? T : never;
