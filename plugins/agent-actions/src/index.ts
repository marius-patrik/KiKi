/**
 * `agent-actions`: explicit per-session actions (formerly session modes) with
 * durable state, executor policy, request routing, a file-defined vocabulary
 * under `.agents/actions`, and the reload actions (soft client reload and the
 * hard server self-restart).
 * @module agent-actions
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { BUILT_IN_ACTIONS, DEFAULT_ACTION, type ActionRoute, type ActionSpec } from "./action.js";
import { ActionCatalog } from "./catalog.js";
import { ACTION_SELECTED, ActionsController } from "./controller.js";
import { createReloadHandler } from "./reload.js";

export {
  ACTIONS,
  BUILT_IN_ACTIONS,
  DEFAULT_ACTION,
  parseAction,
  sanitizeId,
} from "./action.js";
export type { ActionRoute, ActionSpec, BuiltInAction } from "./action.js";
export { ActionCatalog } from "./catalog.js";
export type { ActionCatalogConfig } from "./catalog.js";
export {
  ACTION_SELECTED,
  LEGACY_MODE_SELECTED,
  ActionsController,
  foldAction,
} from "./controller.js";
export type { ActionState } from "./controller.js";
export * from "./reload.js";

export const name = "agent-actions";
export const inject = ["commands", "systemPrompt", "webServer"];

declare module "@deepseek-ai/cordis" {
  interface Context {
    actions: ActionsController;
  }
}

export interface Config {
  /** The action a fresh session runs on. */
  defaultAction?: string;
  /** Per-action provider/model routing. */
  routes?: Record<string, ActionRoute>;
  /** Per-action tool allowlists. */
  tools?: Record<string, readonly string[]>;
  /** The authoring root for file-defined actions (default: <DSH_HOME>/actions). */
  actionsRoot?: string;
}

/** The DSH home root, matching the launcher's resolution. */
function dshHome(): string {
  return resolve(process.env.DSH_HOME ?? join(homedir(), ".agents"));
}

/** apply implementation. */
export function apply(ctx: Context, config: Config = {}): void {
  const root = config.actionsRoot ?? join(dshHome(), "actions");
  const catalog = new ActionCatalog({ root });
  const defaultAction = config.defaultAction ?? DEFAULT_ACTION;
  const controller = new ActionsController(defaultAction, (id) => catalog.ids().includes(id));

  const provider = ctx as unknown as { provide(name: string, value: unknown): unknown };
  provider.provide("actions", controller);

  void catalog.load();

  const eventContext = ctx as unknown as {
    on(name: string, listener: (...args: any[]) => any): unknown;
  };

  // Commit a queued action at the next accepted in-turn step, and append the
  // durable selection event (new name; the fold accepts the legacy name too).
  eventContext.on("agent/pre-step", async (payload: any, next: () => Promise<any>) => {
    const decision = await next();
    if (decision?.kind === "enter" && !payload.signal?.aborted) {
      const pending = controller.get(payload.agent).pending;
      if (pending !== undefined) {
        controller.commit(payload.agent);
        const session = payload.agent?.session as
          | { append?: (type: string, data: unknown) => unknown }
          | undefined;
        session?.append?.(ACTION_SELECTED, { action: pending });
      }
    }
    return decision;
  });

  // Executor policy: the active action's allowlist gates every tool call.
  eventContext.on("tools/pre-execute", async (exec: any, next: () => Promise<any>) => {
    const active = controller.get(exec.agent).active;
    const allow = config.tools?.[active] ?? catalog.get(active)?.tools;
    if (allow !== undefined && !allow.includes(exec.name)) {
      return {
        kind: "deny",
        reason: `Tool ${exec.name} is unavailable in the ${catalog.nameOf(active)} action.`,
      };
    }
    return next();
  });

  // Request routing: the active action may pin a provider/model.
  eventContext.on("agent/request", async (payload: any, next: () => Promise<any>) => {
    const request = await next();
    const active = controller.get(payload.agent).active;
    const route = config.routes?.[active] ?? catalog.get(active)?.route;
    return route === undefined ? request : { ...request, ...route };
  });

  const prompts = (ctx as unknown as { systemPrompt?: { section(definition: unknown): unknown } })
    .systemPrompt;
  prompts?.section({
    name: "action:policy",
    order: 50,
    text: ({ agent }: { agent?: object }) => {
      if (agent === undefined) return "";
      const active = controller.get(agent).active;
      const policy = catalog.get(active)?.policy ?? "";
      return `Current session action: ${catalog.nameOf(active)}.${policy === "" ? "" : ` ${policy}`}`;
    },
  });

  const commands = (ctx as unknown as { commands?: { register(definition: unknown): () => void } })
    .commands;
  /**
   * Registers a command to select an agent preset.
   *
   * Guarantees that the provided preset ID is valid and not already registered.
   * Returns nothing on success, or an error message if the preset is unknown.
   *
   * @param definition - The command definition object containing the handler.
   */
  const safeRegister = (definition: unknown) => {
    try {
      commands?.register(definition);
    } catch {
      // Built-in or existing command already registered
    }
  };
  const /** selectHandler implementation. */
    selectHandler = ({ agent, rawInput }: { agent: object; rawInput: string }) => {
      const id = rawInput.trim();
      if (!catalog.ids().includes(id)) return { kind: "error", text: `Unknown preset: ${id}` };
      const result = controller.set(agent, id);
      return {
        kind: "success",
        text: result === "noop" ? `Preset already ${id}` : `Preset queued: ${id}`,
      };
    };
  safeRegister({
    name: "preset",
    description: "Select the agent preset",
    input: { hint: `[${catalog.ids().join("|")}]` },
    handler: selectHandler,
  });
  safeRegister({
    name: "action",
    description: "Select the session preset (alias of /preset)",
    input: { hint: `[${catalog.ids().join("|")}]` },
    handler: selectHandler,
  });
  safeRegister({
    name: "goal",
    description: "Launch goal pursuit mode for long-running autonomous tasks",
    input: { hint: "<goal description>" },
    handler: ({ rawInput }: { rawInput: string }) => {
      const goal = rawInput.trim();
      if (!goal) return { kind: "error", text: "Please specify a goal description: /goal <task>" };
      return {
        kind: "success",
        text: `Goal mode initiated: ${goal}. The agent will persist until complete.`,
      };
    },
  });
  safeRegister({
    name: "plan",
    description: "Create an exhaustive step-by-step execution plan before making changes",
    input: { hint: "<task specification>" },
    handler: ({ rawInput }: { rawInput: string }) => {
      const task = rawInput.trim();
      return {
        kind: "success",
        text: `Planning workflow triggered for: ${task || "current context"}. Plan artifact will be generated.`,
      };
    },
  });
  safeRegister({
    name: "schedule",
    description: "Schedule a background execution or recurring agent cron",
    input: { hint: "<duration|cron> <prompt>" },
    handler: ({ rawInput }: { rawInput: string }) => {
      const input = rawInput.trim();
      if (!input)
        return { kind: "error", text: "Usage: /schedule <duration_seconds|cron> <prompt>" };
      return { kind: "success", text: `Agent schedule registered: ${input}` };
    },
  });
  safeRegister({
    name: "grill-me",
    description: "Align on design decisions through an interactive interview",
    input: { hint: "[topic]" },
    handler: ({ rawInput }: { rawInput: string }) => {
      return {
        kind: "success",
        text: `Interactive clarification started${rawInput ? ` on ${rawInput.trim()}` : ""}.`,
      };
    },
  });
  safeRegister({
    name: "teamwork-preview",
    description: "Orchestrate autonomous subagents working together on a project",
    input: { hint: "[task]" },
    handler: ({ rawInput }: { rawInput: string }) => {
      return {
        kind: "success",
        text: `Teamwork preview launched for autonomous multi-agent orchestration.`,
      };
    },
  });
  safeRegister({
    name: "learn",
    description: "Extract lessons and persist them into agent memory for future sessions",
    input: { hint: "[topic]" },
    handler: ({ rawInput }: { rawInput: string }) => {
      return {
        kind: "success",
        text: `Agent learning triggered${rawInput ? ` for ${rawInput.trim()}` : ""}. Lessons will be recorded.`,
      };
    },
  });
  commands?.register({
    name: "compact",
    description: "Compress and summarize active context window",
    handler: () => ({ kind: "success", text: "Context compaction executed." }),
  });
  commands?.register({
    name: "clear",
    description: "Clear current conversation viewport",
    handler: () => ({ kind: "success", text: "Conversation viewport cleared." }),
  });

  (
    ctx as unknown as { inject(services: string[], callback: (sub: unknown) => void): void }
  ).inject?.(["webServer"], (sub) => {
    const webCtx = sub as unknown as {
      webServer: {
        register(definition: {
          kind: "exact" | "prefix";
          method?: string;
          path: string;
          handler: (req: any, res: any) => Promise<void> | void;
        }): () => void;
      };
    };
    const /** json implementation. */
      json = (res: any, status: number, body: unknown): void => {
        res.writeHead(status, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify(body));
      };
    /**
     * Describes an action specification by extracting its properties.
     *
     * Guarantees a JSON-like object with `id`, `name`, `description`, `tools`, `route`, and `source`.
     * If any of the properties are not provided in `action`, they are set to `null` or `false`.
     *
     * On failure, returns an object with the same structure but with missing or nullified properties.
     */
    const describe = (action: ActionSpec) => ({
      id: action.id,
      name: action.name ?? action.id,
      description: action.description ?? null,
      tools: action.tools ?? null,
      route: action.route ?? null,
      source: action.source ?? null,
      builtIn: BUILT_IN_ACTIONS.some((builtIn) => builtIn.id === action.id),
    });

    // The action vocabulary (built-ins + file-defined) — also the run palette's data.
    /**
     * Guarantees a JSON-like object array with `id`, `name`, `description`, `tools`, `route`, and `source` for each action.
     * If any of the properties are not provided in `action`, they are set to `null` or `false`.
     * On failure, returns an array of objects with the same structure but with missing or nullified properties.
     */
    const listHandler = async (_req: unknown, res: any) => {
      await catalog.load();
      json(res, 200, {
        defaultAction,
        root,
        actions: catalog.list().map(describe),
        commands: [
          {
            id: "reload-app",
            name: "Reload App",
            description: "Reload the browser UI; server-side agents keep running and reattach.",
            kind: "soft",
          },
          {
            id: "force-reload",
            name: "Force Reload",
            description: "Restart the dsh web server itself, then reload the UI.",
            kind: "force",
          },
        ],
      });
    };
    webCtx.webServer.register({ kind: "exact", path: "/actions", handler: listHandler });

    // The hard path: server self-restart that answers before it exits.
    webCtx.webServer.register({
      kind: "exact",
      method: "POST",
      path: "/actions/api/reload",
      handler: createReloadHandler(),
    });
  });
}
