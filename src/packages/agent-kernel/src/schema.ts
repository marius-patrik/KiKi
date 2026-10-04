/**
 * SQLite schema for the append-only agent worldline.
 * @module agent-kernel/schema
 */

/** Canonical v1 worldline schema. */
export const WORLDLINE_SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
PRAGMA trusted_schema=OFF;

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  source_cursor TEXT NOT NULL,
  type TEXT NOT NULL,
  observed_wall_ns TEXT NOT NULL,
  observed_monotonic_ns TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  UNIQUE(source_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS events_source_cursor
ON events(source_id, sequence);

CREATE INDEX IF NOT EXISTS events_type_sequence
ON events(type, sequence);

CREATE INDEX IF NOT EXISTS events_trace_sequence
ON events(trace_id, sequence);

CREATE TABLE IF NOT EXISTS source_cursors (
  source_id TEXT PRIMARY KEY,
  cursor TEXT NOT NULL,
  event_id TEXT NOT NULL,
  updated_at_wall_ns TEXT NOT NULL
) WITHOUT ROWID;

PRAGMA user_version=1;
`;
