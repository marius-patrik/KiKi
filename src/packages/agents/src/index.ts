/**
 * `agents`: custom agents as JSON/Markdown persona files for the dsh
 * harness. A persona file in the authoring directory (default `<dshHome>/agents`)
 * is materialized as an agent preset under the harness's user preset root, so
 * it appears in every preset picker without a restart. The materialized preset
 * is the base preset's composition (default `standard`) with a neutral persona
 * row — the agent keeps the base's capabilities, and the live persona comes
 * from the `persona:policy` prompt section, which resolves the session's
 * persona from the runtime catalog.
 *
 * Live persona switching mirrors the harness's own plan-mode pattern: a
 * durable `persona/selected` session-log event folded on read, selections kept
 * pending during an open turn and committed at the next accepted in-turn
 * pre-step, a `/persona` command, and a `persona` session projection the web
 * client folds into its composer badge and switcher. Switching changes session
 * state only — never the mounted composition (blank-session-locked) — so it
 * works mid-conversation.
 * @module agents
 */

import type { Context } from "@deepseek-ai/cordis";
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import {
  AgentSettings,
  authoringRoot,
  defaultBase,
  defaultPersona,
  type AgentSettings as AgentSettingsType,
} from "./settings.js";
import { basePresetDir, syncPersonas } from "./sync.js";
import { PersonaCatalog } from "./catalog.js";
import { PERSONA_SELECTED, PersonaController, foldPersona } from "./controller.js";
import type { HostAgent, HostSessionEvent, PreStepDecision } from "./types.js";

export type * from "./settings.js";
export type * from "./persona.js";
export type * from "./compose.js";
export type * from "./sync.js";
export type * from "./catalog.js";
export type * from "./controller.js";
export type * from "./types.js";
export type * from "./presets.js";
export { materializeAgentPresetPack } from "./presets.js";

export const name = "agents";
export const inject: string[] = [];

/** Deployment configuration: the same fields the settings section carries. */
export const Config: z<AgentSettingsType> = AgentSettings;

/** How long a burst of authoring-directory events is debounced before a sync. */
const WATCH_DEBOUNCE_MS = 250;

/** The narrow prompt-section context: the assembling agent, when scoped. */
interface SectionContext {
  agent?: HostAgent;
}

/** The session-projection registry face the `persona` unit registers with. */
interface ProjectionFace {
  register(definition: {
    key: string;
    schema: unknown;
    init: () => { personaId: string; pending: boolean };
    apply: (
      state: { personaId: string; pending: boolean },
      event: HostSessionEvent,
    ) => { personaId: string; pending: boolean };
    view: (state: { personaId: string; pending: boolean }) => {
      personaId: string;
      pending: boolean;
    };
    stateVersion: number;
  }): () => void;
}

/** The command registry face the `/persona` command registers with. */
interface CommandFace {
  register(definition: {
    name: string;
    description: string;
    input?: { hint: string };
    handler: (payload: {
      agent: HostAgent;
      rawInput: string;
    }) => { kind: "success"; text: string } | { kind: "error"; text: string };
  }): () => void;
}

/** The harness event hub face the pre-step listener registers with. */
interface EventHub {
  on(
    event: string,
    listener: (
      payload: { agent: HostAgent; signal: AbortSignal },
      next: () => Promise<PreStepDecision>,
    ) => Promise<PreStepDecision>,
  ): unknown;
}

/**
 * The `persona:policy` section text for one assembly: the live persona (a
 * pending selection or the last committed `persona/selected`) wins; without
 * one, the session's composed preset persona (`header.agentPreset`) applies;
 * then the configured `defaultPersona`. A persona only renders when the
 * runtime catalog knows it — otherwise the deployment persona stands.
 */
export function personaPolicyText(
  context: SectionContext,
  controller: PersonaController,
  catalog: PersonaCatalog,
  fallback: string | undefined,
): string {
  const agent = context.agent;
  if (agent === undefined) return "";
  const live = controller.pendingOf(agent) ?? foldPersona(agent.session.events);
  const livePersona = live !== "" ? catalog.get(live) : undefined;
  if (livePersona !== undefined) return livePersona.prompt;
  const headerId = agent.session.header?.agentPreset;
  const headerPersona = headerId !== undefined ? catalog.get(headerId) : undefined;
  if (headerPersona !== undefined) return headerPersona.prompt;
  const fallbackPersona = fallback !== undefined ? catalog.get(fallback) : undefined;
  return fallbackPersona?.prompt ?? "";
}

/**
 * Best-effort materialization: never fails a boot over an authoring problem
 * (a persona file out of date with the plugin, a read error, a full disk).
 * @returns whether the sync produced no failed files.
 */
async function syncOnce(
  ctx: Context,
  home: string,
  root: string,
  baseDir: string | undefined,
): Promise<boolean> {
  try {
    const report = await syncPersonas(home, root, baseDir);
    if (report.failed.length > 0) {
      for (const failure of report.failed) ctx.logger.warn(`agents: ${failure}`);
    }
    if (report.materialized.length > 0 || report.pruned.length > 0) {
      ctx.logger.info(
        `agents: ${report.materialized.map((m) => m.id).join(", ") || "no presets"} materialized; ` +
          `${report.pruned.join(", ") || "nothing"} pruned`,
      );
    }
    return report.failed.length === 0;
  } catch (error) {
    ctx.logger.warn(
      `agents: sync failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Declare this plugin's settings surface and install the live-persona machinery.
 *
 * Since 0.2.0 no settings form is registered: the settings service projects the
 * volatile Config fields of the active profile's entries, so this plugin's own
 * `AgentSettings` is its form and its namespace is its entry id `agents`. All
 * that is left to declare is that this plugin ships its own page for that form.
 *
 * The authoring directory, the default base preset, and the fallback persona are
 * read from the `config` this entry was applied with — the settings section
 * `agents` used to hand over separately no longer exists, and nothing mirrors it
 * into a mutable module-level copy.
 *
 * When the settings service is live, the rest mounts: the runtime catalog, a
 * sync at boot, a debounced re-sync whenever the authoring directory changes,
 * and the live-persona surface — the `persona:policy` section, the `persona`
 * projection unit, the `/persona` command, and the pending-commit pre-step
 * listener.
 *
 * @param ctx - the plugin's context.
 * @param config - the `agents` profile entry this plugin was applied with: the
 *   authoring root, the default base preset, and the fallback persona id.
 */
export function apply(ctx: Context, config: AgentSettingsType): void {
  declareCustomSettingsPage(ctx);

  ctx.inject(["settings"], (sctx) => {
    const home = resolveDshHome();
    const root = authoringRoot(home, undefined, config);
    const base = defaultBase(undefined, config);
    const fallback = defaultPersona(undefined, config);
    const baseDir = basePresetDir();

    const catalog = new PersonaCatalog({ root });
    const controller = new PersonaController({
      resolve: (personaId) => catalog.get(personaId) !== undefined,
    });
    (sctx as unknown as { provide(name: string, value: unknown): unknown }).provide(
      "personaController",
      controller,
    );
    (sctx as unknown as { provide(name: string, value: unknown): unknown }).provide(
      "personaCatalog",
      catalog,
    );

    const events = sctx as unknown as EventHub;
    events.on("agent/pre-step", async (payload, next): Promise<PreStepDecision> => {
      const decision = await next();
      if (decision.kind === "reject" || payload.signal.aborted) return decision;
      const pending = controller.pendingOf(payload.agent);
      if (pending === undefined) return decision;
      try {
        controller.commitPending(payload.agent.session);
      } catch (error) {
        ctx.logger.warn("agents: failed to append selected persona at step start: %o", error);
      }
      return decision;
    });

    sctx.inject(["systemPrompt"], (pctx) => {
      const systemPrompt = pctx as unknown as {
        systemPrompt: {
          section(definition: {
            name: string;
            order: number;
            text: (context: SectionContext) => string;
          }): () => void;
        };
      };
      pctx.effect(
        () =>
          systemPrompt.systemPrompt.section({
            name: "persona:policy",
            order: 45,
            text: (context) => personaPolicyText(context, controller, catalog, fallback),
          }),
        "agents: persona:policy section",
      );
    });

    sctx.inject(["sessionProjections"], (pctx) => {
      const projections = pctx as unknown as { sessionProjections: ProjectionFace };
      const personaSchema = z.object({ personaId: z.string(), pending: z.boolean() });
      type PersonaState = { personaId: string; pending: boolean };
      const projectionSchema = Object.assign((v: unknown) => personaSchema(v as PersonaState), {
        parse: (v: unknown) => personaSchema(v as PersonaState),
      });
      pctx.effect(
        () =>
          projections.sessionProjections.register({
            key: "persona",
            schema: projectionSchema,
            init: () => ({ personaId: "", pending: false }),
            apply: (state, event) => {
              if (event.type === "command/run" && event.data?.name === "persona") {
                const args = event.data.args;
                if (typeof args !== "string" || args.trim() === "") return state;
                const personaId = args.trim();
                return personaId === state.personaId ? state : { personaId, pending: true };
              }
              if (event.type === PERSONA_SELECTED) {
                const personaId = event.data?.personaId;
                if (typeof personaId !== "string") return state;
                return { personaId, pending: false };
              }
              return state;
            },
            view: (state) => state,
            stateVersion: 1,
          }),
        "agents: persona projection",
      );
    });

    sctx.inject(["commands"], (cctx) => {
      const commands = cctx as unknown as { commands: CommandFace };
      cctx.effect(
        () =>
          commands.commands.register({
            name: "persona",
            description: "Switch the active persona",
            input: { hint: "[<personaId>]" },
            handler: ({ agent, rawInput }) => {
              const personaId = rawInput.trim();
              if (personaId === "") {
                const current = controller.pendingOf(agent) ?? foldPersona(agent.session.events);
                if (current !== "") return { kind: "success", text: `Current persona: ${current}` };
                const headerId = agent.session.header?.agentPreset;
                if (headerId !== undefined && catalog.get(headerId) !== undefined)
                  return { kind: "success", text: `Current persona: ${headerId}` };
                if (fallback !== undefined && catalog.get(fallback) !== undefined)
                  return { kind: "success", text: `Current persona: ${fallback}` };
                return { kind: "success", text: "No persona selected (deployment default)." };
              }
              try {
                const outcome = controller.set(agent, personaId);
                const text =
                  outcome === "committed"
                    ? `Persona switched to ${personaId}.`
                    : outcome === "queued"
                      ? `Switching to ${personaId} (applies from the next step).`
                      : outcome === "cancelled"
                        ? "Persona switch cancelled; the logged persona already matches."
                        : `Persona is already ${personaId}.`;
                return { kind: "success", text };
              } catch (error) {
                return {
                  kind: "error",
                  text: error instanceof Error ? error.message : String(error),
                };
              }
            },
          }),
        "agents: /persona command",
      );
    });

    void mkdir(root, { recursive: true })
      .then(() => {
        void catalog.load();
        void syncOnce(sctx, home, root, baseDir);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const watcher = watch(root, () => {
          if (timer !== undefined) clearTimeout(timer);
          timer = setTimeout(() => {
            void catalog.load();
            void syncOnce(sctx, home, root, baseDir);
          }, WATCH_DEBOUNCE_MS);
        });
        watcher.on("error", (error) =>
          ctx.logger.warn(`agents: watching ${root} failed: ${error.message}`),
        );
        watcher.unref();
        sctx.effect(
          () => () => {
            if (timer !== undefined) clearTimeout(timer);
            watcher.close();
          },
          "agents.watch()",
        );
      })
      .catch(() => {});
  });
}
