/**
 * Cordis-mounted persistent agent kernel service.
 * @module agent-kernel/kernel
 */

import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { Service } from "@deepseek-ai/cordis";
import { EnvironmentRegistry } from "./environment-registry.js";
import { resolveAgentStateRoot } from "./paths.js";
import type {
  AgentEnvironment,
  AgentEventRecord,
  EventSource,
  JsonValue,
  SourceEvent,
} from "./types.js";
import { uuidV7 } from "./uuid-v7.js";
import { AgentWorldline } from "./worldline.js";

/** Construction override used by tests or alternate DSH state roots. */
export interface AgentKernelOptions {
  readonly stateRoot?: string;
}

/**
 * Durable semantic substrate beneath conversations, providers and personas.
 * The Cordis process hosts this service but does not define its persistent identity.
 */
export class AgentKernel extends Service {
  readonly worldline: AgentWorldline;
  readonly environments = new EnvironmentRegistry();
  private readonly listeners = new Set<(event: AgentEventRecord) => void>();
  private closed = false;

  /** Construct and mount the kernel as ctx.agentKernel. */
  constructor(ctx: Context, options: AgentKernelOptions = {}) {
    super(ctx, "agentKernel");
    const stateRoot = options.stateRoot ?? resolveAgentStateRoot();
    this.worldline = new AgentWorldline(join(stateRoot, "worldline.sqlite3"));
  }

  /** Stable durable identity of this DSH agent. */
  get id(): string {
    return this.worldline.agentId;
  }

  /** Register an external environment. */
  registerEnvironment(environment: AgentEnvironment): () => void {
    this.assertOpen();
    return this.environments.register(environment);
  }

  /** Record one event from any DSH/external source. */
  record(sourceId: string, event: SourceEvent): AgentEventRecord {
    this.assertOpen();
    const result = this.worldline.append(sourceId, event);
    if (result.inserted) {
      for (const listener of this.listeners) listener(result.event);
    }
    return result.event;
  }

  /**
   * Replay then follow every EventSource of one environment from its own
   * transactionally committed cursor. Finite test sources simply return.
   */
  async consumeEnvironment(environmentId: string, signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    const environment = this.environments.get(environmentId);
    await Promise.all(
      environment.eventSources.map((source) => this.consumeSource(source, signal)),
    );
  }

  /** Invoke one environment capability with a fresh trace when none is supplied. */
  async invoke(
    environmentId: string,
    capabilityId: string,
    input: JsonValue,
    traceId = uuidV7(),
  ): Promise<JsonValue> {
    this.assertOpen();
    return this.environments.invoke(environmentId, capabilityId, input, traceId);
  }

  /** Observe newly inserted DSH worldline records. */
  observe(listener: (event: AgentEventRecord) => void): () => void {
    this.assertOpen();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Close durable state; repeated disposal is safe. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.worldline.close();
  }

  /** Consume one source from its durable cursor. */
  private async consumeSource(source: EventSource, signal?: AbortSignal): Promise<void> {
    const afterCursor = this.worldline.cursor(source.id);
    for await (const event of source.events({ afterCursor, signal })) {
      if (signal?.aborted === true) break;
      this.record(source.id, event);
    }
  }

  /** Reject use-after-dispose with an explicit failure. */
  private assertOpen(): void {
    if (this.closed) throw new Error("agent-kernel: service is closed");
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    agentKernel: AgentKernel;
  }
}
