/**
 * Durable append-only DSH agent worldline.
 * @module agent-kernel/worldline
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { compareCursor, normalizeCursor } from "./cursor.js";
import { decodeSourceEvent, encodeSourceEvent, normalizeSourceEvent } from "./envelope.js";
import { WORLDLINE_SCHEMA } from "./schema.js";
import type { AgentEventRecord, SourceEvent } from "./types.js";
import { uuidV7 } from "./uuid-v7.js";

/** Read one required TEXT result column with an explicit runtime type check. */
function stringColumn(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key];
  if (typeof value !== "string")
    throw new Error(`agent-kernel: database column ${key} is not text`);
  return value;
}

/** Read one required safe-integer result column with an explicit runtime type check. */
function numberColumn(row: Readonly<Record<string, unknown>>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`agent-kernel: database column ${key} is not a safe integer`);
  }
  return value;
}

/** Decode one SQLite result row into the public durable event shape. */
function decodeRecord(row: Readonly<Record<string, unknown>>): AgentEventRecord {
  return {
    sequence: numberColumn(row, "sequence"),
    id: stringColumn(row, "id"),
    sourceId: stringColumn(row, "source_id"),
    event: decodeSourceEvent(stringColumn(row, "envelope_json")),
  };
}

/** Result of one idempotent source-event append. */
export interface AppendResult {
  readonly event: AgentEventRecord;
  readonly inserted: boolean;
}

/** SQLite-backed append-only source history for one durable DSH agent identity. */
export class AgentWorldline {
  private readonly db: DatabaseSync;
  readonly agentId: string;

  /** Open/create a worldline at the exact path. */
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(WORLDLINE_SCHEMA);
    this.agentId = this.loadOrCreateAgentId();
  }

  /** Close the underlying SQLite connection. */
  close(): void {
    this.db.close();
  }

  /** Number of durable source events currently recorded. */
  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events").get();
    if (row === undefined) throw new Error("agent-kernel: COUNT returned no row");
    return numberColumn(row, "count");
  }

  /** Last transactionally committed cursor for one EventSource. */
  cursor(sourceId: string): string | undefined {
    const row = this.db
      .prepare("SELECT cursor FROM source_cursors WHERE source_id = ?")
      .get(sourceId);
    if (row === undefined) return undefined;
    return stringColumn(row, "cursor");
  }

  /**
   * Append a source event and advance its source cursor atomically.
   * Duplicate source event identities return the original durable record.
   */
  append(sourceId: string, rawEvent: SourceEvent): AppendResult {
    if (sourceId.length === 0) throw new Error("agent-kernel: event source id is empty");
    const event = normalizeSourceEvent(rawEvent);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const duplicate = this.db
        .prepare(
          "SELECT sequence,id,source_id,envelope_json FROM events WHERE source_id = ? AND source_event_id = ?",
        )
        .get(sourceId, event.id);
      if (duplicate !== undefined) {
        const existing = decodeRecord(duplicate);
        if (existing.event.cursor !== event.cursor) {
          throw new Error(
            `agent-kernel: source event ${sourceId}/${event.id} replayed with a different cursor`,
          );
        }
        this.db.exec("COMMIT");
        return { event: existing, inserted: false };
      }

      const previousCursor = this.cursor(sourceId);
      if (previousCursor !== undefined && compareCursor(event.cursor, previousCursor) < 0) {
        throw new Error(
          `agent-kernel: source ${sourceId} cursor regressed from ${previousCursor} to ${event.cursor}`,
        );
      }

      const id = uuidV7();
      const insert = this.db
        .prepare(
          `INSERT INTO events(
             id,source_id,source_event_id,source_cursor,type,
             observed_wall_ns,observed_monotonic_ns,trace_id,envelope_json
           ) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          sourceId,
          event.id,
          event.cursor,
          event.type,
          event.observedWallNs ?? "",
          event.observedMonotonicNs ?? "",
          event.traceId ?? "",
          encodeSourceEvent(event),
        );

      const sequence = Number(insert.lastInsertRowid);
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new Error("agent-kernel: SQLite returned an invalid event sequence");
      }

      this.db
        .prepare(
          `INSERT INTO source_cursors(source_id,cursor,event_id,updated_at_wall_ns)
           VALUES(?,?,?,?)
           ON CONFLICT(source_id) DO UPDATE SET
             cursor=excluded.cursor,
             event_id=excluded.event_id,
             updated_at_wall_ns=excluded.updated_at_wall_ns`,
        )
        .run(sourceId, event.cursor, id, event.observedWallNs ?? "");

      this.db.exec("COMMIT");
      return {
        event: { sequence, id, sourceId, event },
        inserted: true,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Read DSH worldline records in local sequence order. */
  read(afterSequence = 0, limit = 1000): readonly AgentEventRecord[] {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error("agent-kernel: afterSequence must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
      throw new Error("agent-kernel: limit must be an integer in [1,10000]");
    }
    return this.db
      .prepare(
        `SELECT sequence,id,source_id,envelope_json
         FROM events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?`,
      )
      .all(afterSequence, limit)
      .map((row) => decodeRecord(row));
  }

  /** Read one DSH-local event identity. */
  get(id: string): AgentEventRecord | undefined {
    const row = this.db
      .prepare("SELECT sequence,id,source_id,envelope_json FROM events WHERE id = ?")
      .get(id);
    return row === undefined ? undefined : decodeRecord(row);
  }

  /** Load the stable agent id, creating it only for a new worldline. */
  private loadOrCreateAgentId(): string {
    const existing = this.db.prepare("SELECT value FROM metadata WHERE key = 'agent_id'").get();
    if (existing !== undefined) return stringColumn(existing, "value");

    const id = uuidV7();
    this.db.prepare("INSERT INTO metadata(key,value) VALUES('agent_id',?)").run(id);
    return id;
  }
}

/** Validate a cursor without opening a worldline; exported for environment authors. */
export { normalizeCursor };
