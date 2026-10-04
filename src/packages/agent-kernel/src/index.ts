/**
 * Persistent DSH agent semantic kernel.
 * @module agent-kernel
 */

import type { Context } from "@deepseek-ai/cordis";
import { AgentKernel } from "./kernel.js";

export { compareCursor, normalizeCursor } from "./cursor.js";
export { EnvironmentRegistry } from "./environment-registry.js";
export { resolveAgentStateRoot, resolveDshHome } from "./paths.js";
export { AgentKernel } from "./kernel.js";
export type { AgentKernelOptions } from "./kernel.js";
export { AgentWorldline } from "./worldline.js";
export type { AppendResult } from "./worldline.js";
export type {
  AgentEnvironment,
  AgentEventRecord,
  EnvironmentCapability,
  EnvironmentEffect,
  EnvironmentInvocationContext,
  EventArtifactReference,
  EventEntityReference,
  EventReference,
  EventSource,
  EventSourceRequest,
  JsonValue,
  RegisteredEnvironmentCapability,
  SourceEvent,
} from "./types.js";

export const name = "agent-kernel";
export const inject: string[] = [];

/** Mount the persistent agent kernel and close its database with the plugin fiber. */
export function apply(ctx: Context): void {
  const kernel = new AgentKernel(ctx);
  ctx.effect(() => () => kernel.close());
}
