/**
 * Runtime catalog for external semantic environments.
 * @module agent-kernel/environment-registry
 */

import { requireJsonValue } from "./envelope.js";
import type {
  AgentEnvironment,
  EventSource,
  JsonValue,
  RegisteredEnvironmentCapability,
} from "./types.js";

/** Pure environment/source/capability registry. */
export class EnvironmentRegistry {
  private readonly environments = new Map<string, AgentEnvironment>();
  private readonly sourceOwners = new Map<string, string>();

  /** Register one environment; duplicate environment/source identities fail loudly. */
  register(environment: AgentEnvironment): () => void {
    if (environment.id.length === 0) throw new Error("agent-kernel: environment id is empty");
    if (this.environments.has(environment.id)) {
      throw new Error(`agent-kernel: environment "${environment.id}" is already registered`);
    }

    const seenCapabilities = new Set<string>();
    for (const capability of environment.capabilities) {
      if (capability.id.length === 0) throw new Error("agent-kernel: capability id is empty");
      if (seenCapabilities.has(capability.id)) {
        throw new Error(
          `agent-kernel: environment "${environment.id}" declares capability "${capability.id}" twice`,
        );
      }
      seenCapabilities.add(capability.id);
    }

    for (const source of environment.eventSources) {
      if (source.id.length === 0) throw new Error("agent-kernel: event source id is empty");
      const owner = this.sourceOwners.get(source.id);
      if (owner !== undefined) {
        throw new Error(
          `agent-kernel: event source "${source.id}" is already owned by environment "${owner}"`,
        );
      }
    }

    this.environments.set(environment.id, environment);
    for (const source of environment.eventSources) this.sourceOwners.set(source.id, environment.id);

    let withdrawn = false;
    return () => {
      if (withdrawn) return;
      withdrawn = true;
      this.environments.delete(environment.id);
      for (const source of environment.eventSources) this.sourceOwners.delete(source.id);
    };
  }

  /** Resolve one environment or fail rather than silently no-op. */
  get(id: string): AgentEnvironment {
    const environment = this.environments.get(id);
    if (environment === undefined) throw new Error(`agent-kernel: unknown environment "${id}"`);
    return environment;
  }

  /** Environments in registration order. */
  all(): readonly AgentEnvironment[] {
    return [...this.environments.values()];
  }

  /** Every registered EventSource across environments. */
  eventSources(): readonly EventSource[] {
    return this.all().flatMap((environment) => [...environment.eventSources]);
  }

  /** Every capability annotated with its realizing environment. */
  capabilities(): readonly RegisteredEnvironmentCapability[] {
    return this.all().flatMap((environment) =>
      environment.capabilities.map((capability) => ({
        environmentId: environment.id,
        capability,
      })),
    );
  }

  /** Invoke exactly one declared environment capability. */
  async invoke(
    environmentId: string,
    capabilityId: string,
    input: JsonValue,
    traceId: string,
  ): Promise<JsonValue> {
    const environment = this.get(environmentId);
    if (!environment.capabilities.some((capability) => capability.id === capabilityId)) {
      throw new Error(
        `agent-kernel: environment "${environmentId}" does not declare capability "${capabilityId}"`,
      );
    }
    return requireJsonValue(
      await environment.invoke(capabilityId, input, { traceId }),
    );
  }
}
