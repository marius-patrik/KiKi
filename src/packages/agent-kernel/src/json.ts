/**
 * Runtime validation for durable JSON values.
 * @module agent-kernel/json
 */

import type { JsonValue } from "./types.js";

/** Whether an unknown value can be persisted as canonical agent JSON. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  if (typeof value !== "object") return false;

  for (const nested of Object.values(value)) {
    if (!isJsonValue(nested)) return false;
  }
  return true;
}

/** Parse JSON and reject values outside the durable JSON contract. */
export function parseJsonValue(text: string): JsonValue {
  const value: unknown = JSON.parse(text);
  if (!isJsonValue(value)) throw new Error("agent-kernel: stored event envelope is not JSON-safe");
  return value;
}
