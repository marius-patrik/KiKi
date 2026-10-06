/**
 * Protocol types for the dsh web API wire format.
 *
 * These mirror the shapes defined in harness/packages/host/apiproxy/src/api/
 * without importing from the harness (standalone client principle).
 *
 * @module dsh-tui/protocol
 */

/* -------------------------------------------------------------------------- */
/* Client → Server (RPC requests)                                             */
/* -------------------------------------------------------------------------- */

export interface ClientRequest {
  type: "client-request";
  rpcId: string;
  method: string;
  payload: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Server → Client (RPC responses)                                             */
/* -------------------------------------------------------------------------- */

export interface ServerResponse {
  type: "server-response";
  rpcId: string;
  result: { ok: boolean; value?: unknown };
}

/* -------------------------------------------------------------------------- */
/* Server → Client (SSE push frames)                                           */
/* -------------------------------------------------------------------------- */

/** Server-initiated request (via SSE or WS downlink). */
export interface ServerRequest {
  type: "server-request";
  rpcId: string;
  method: string;
  payload: Record<string, unknown>;
}

/** Union of all possible mux frames. */
export type MuxFrame = ServerRequest;

/* -------------------------------------------------------------------------- */
/* Domain types                                                                */
/* -------------------------------------------------------------------------- */

/** A session descriptor as returned by session.list. */
export interface SessionDescriptor {
  id: string;
  title: string;
  workspaceId?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

/** A session event as returned by session.history or streamed via SSE. */
export interface SessionEvent {
  type: string;
  seq: number;
  role?: string;
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** A model descriptor as returned by session.models. */
export interface ModelDescriptor {
  id: string;
  name: string;
  provider: string;
  [key: string]: unknown;
}

/** A goal descriptor as returned by goal.create. */
export interface GoalDescriptor {
  id: string;
  title: string;
  status: "active" | "paused" | "completed";
  [key: string]: unknown;
}
