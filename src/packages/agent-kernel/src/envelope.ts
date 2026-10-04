/**
 * Source-event normalization and durable JSON codec.
 * @module agent-kernel/envelope
 */

import { normalizeCursor } from "./cursor.js";
import { isJsonValue } from "./json.js";
import type {
  EventArtifactReference,
  EventEntityReference,
  EventReference,
  JsonValue,
  SourceEvent,
} from "./types.js";
import { uuidV7 } from "./uuid-v7.js";

function isStringRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEventReference(value: unknown): value is EventReference {
  return (
    isStringRecord(value) &&
    typeof value.sourceId === "string" &&
    typeof value.eventId === "string"
  );
}

function isEntityReference(value: unknown): value is EventEntityReference {
  return (
    isStringRecord(value) &&
    typeof value.identity === "string" &&
    typeof value.role === "string" &&
    (value.system === undefined || typeof value.system === "string")
  );
}

function isArtifactReference(value: unknown): value is EventArtifactReference {
  return isEntityReference(value);
}

function optionalReferenceArray<T>(
  value: unknown,
  validator: (item: unknown) => item is T,
): readonly T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => validator(item))) {
    throw new Error("agent-kernel: invalid event reference list");
  }
  return value;
}

/** Normalize defaults while retaining source identity/payload exactly. */
export function normalizeSourceEvent(event: SourceEvent): SourceEvent {
  if (event.id.length === 0) throw new Error("agent-kernel: source event id is empty");
  if (event.type.length === 0) throw new Error("agent-kernel: source event type is empty");
  if (!isJsonValue(event.payload)) throw new Error("agent-kernel: source event payload is not JSON-safe");
  if (event.provenance !== undefined && !isJsonValue(event.provenance)) {
    throw new Error("agent-kernel: source event provenance is not JSON-safe");
  }

  return {
    ...event,
    cursor: normalizeCursor(event.cursor),
    observedWallNs: event.observedWallNs ?? (BigInt(Date.now()) * 1_000_000n).toString(),
    observedMonotonicNs: event.observedMonotonicNs ?? process.hrtime.bigint().toString(),
    traceId: event.traceId ?? uuidV7(),
  };
}

/** Decode a source event written by {@link encodeSourceEvent}. */
export function decodeSourceEvent(text: string): SourceEvent {
  const value: unknown = JSON.parse(text);
  if (!isStringRecord(value)) throw new Error("agent-kernel: stored event envelope is not an object");
  if (
    typeof value.id !== "string" ||
    typeof value.cursor !== "string" ||
    typeof value.type !== "string" ||
    typeof value.observedWallNs !== "string" ||
    typeof value.observedMonotonicNs !== "string" ||
    typeof value.traceId !== "string" ||
    !isJsonValue(value.payload)
  ) {
    throw new Error("agent-kernel: stored event envelope is malformed");
  }
  if (value.provenance !== undefined && !isJsonValue(value.provenance)) {
    throw new Error("agent-kernel: stored event provenance is malformed");
  }

  return {
    id: value.id,
    cursor: normalizeCursor(value.cursor),
    type: value.type,
    observedWallNs: value.observedWallNs,
    observedMonotonicNs: value.observedMonotonicNs,
    traceId: value.traceId,
    causalParents: optionalReferenceArray(value.causalParents, isEventReference),
    entities: optionalReferenceArray(value.entities, isEntityReference),
    artifacts: optionalReferenceArray(value.artifacts, isArtifactReference),
    payload: value.payload,
    ...(value.provenance !== undefined ? { provenance: value.provenance } : {}),
  };
}

/** Serialize a normalized source event. */
export function encodeSourceEvent(event: SourceEvent): string {
  return JSON.stringify(event);
}

/** Assert that a generic capability result is JSON-safe. */
export function requireJsonValue(value: unknown): JsonValue {
  if (!isJsonValue(value)) throw new Error("agent-kernel: environment returned non-JSON capability output");
  return value;
}
