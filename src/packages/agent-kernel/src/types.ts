/**
 * Public semantic contracts for the persistent DSH agent kernel.
 * @module agent-kernel/types
 */

/** JSON values accepted as durable event payloads and capability I/O. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Stable reference to an event in any source worldline. */
export interface EventReference {
  readonly sourceId: string;
  readonly eventId: string;
}

/** One semantic identity referenced by an event. */
export interface EventEntityReference {
  readonly identity: string;
  readonly role: string;
  readonly system?: string;
}

/** One immutable artifact referenced by an event. */
export interface EventArtifactReference {
  readonly identity: string;
  readonly role: string;
  readonly system?: string;
}

/** A source event before it receives a DSH-local worldline identity. */
export interface SourceEvent {
  /** Stable identity assigned by the source. */
  readonly id: string;
  /** Monotonically increasing unsigned-decimal source cursor. */
  readonly cursor: string;
  /** Stable dotted event type. */
  readonly type: string;
  /** UTC nanoseconds encoded as unsigned-decimal text. */
  readonly observedWallNs?: string;
  /** Source/process monotonic nanoseconds encoded as unsigned-decimal text. */
  readonly observedMonotonicNs?: string;
  /** Trace identity preserved across source/tool/model boundaries when available. */
  readonly traceId?: string;
  /** Causal parents in their original source identity spaces. */
  readonly causalParents?: readonly EventReference[];
  /** Semantic identities the event concerns. */
  readonly entities?: readonly EventEntityReference[];
  /** Immutable artifacts the event concerns. */
  readonly artifacts?: readonly EventArtifactReference[];
  /** Typed/source-specific JSON payload. */
  readonly payload: JsonValue;
  /** Source provenance attached without reinterpretation. */
  readonly provenance?: JsonValue;
}

/** One durable DSH worldline record. */
export interface AgentEventRecord {
  /** DSH-local monotonically increasing sequence. */
  readonly sequence: number;
  /** DSH-local UUIDv7 event identity. */
  readonly id: string;
  /** Globally unique registered EventSource id. */
  readonly sourceId: string;
  /** Original source event envelope. */
  readonly event: SourceEvent;
}

/** Request passed to an EventSource when replay/live consumption begins. */
export interface EventSourceRequest {
  /** Last transactionally committed cursor for this source, when any. */
  readonly afterCursor?: string;
  /** Cancellation signal for a live source. */
  readonly signal?: AbortSignal;
}

/** Lossless ordered event producer registered by an environment. */
export interface EventSource {
  /** Globally unique source identity, e.g. "omnis.core". */
  readonly id: string;
  /** Replay from afterCursor and continue live when the source supports it. */
  events(request: EventSourceRequest): AsyncIterable<SourceEvent>;
}

/** Coarse effect class used before richer environment-specific schemas exist. */
export type EnvironmentEffect = "read" | "write" | "opaque";

/** One capability supplied by an Environment. */
export interface EnvironmentCapability {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly effect: EnvironmentEffect;
  readonly inputSchema?: JsonValue;
  readonly outputSchema?: JsonValue;
}

/** Environment invocation context propagated to the adapter. */
export interface EnvironmentInvocationContext {
  readonly traceId: string;
}

/**
 * External semantic environment. Omnis is one future implementation, not the
 * owner of this interface.
 */
export interface AgentEnvironment {
  readonly id: string;
  readonly eventSources: readonly EventSource[];
  readonly capabilities: readonly EnvironmentCapability[];
  invoke(
    capabilityId: string,
    input: JsonValue,
    context: EnvironmentInvocationContext,
  ): Promise<JsonValue>;
}

/** One capability with the environment that realizes it. */
export interface RegisteredEnvironmentCapability {
  readonly environmentId: string;
  readonly capability: EnvironmentCapability;
}
