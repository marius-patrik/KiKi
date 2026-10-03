/**
 * `agent-tools`: custom tools for the dsh harness, defined by the user rather
 * than shipped. The plugin registers each tool in the `agent-tools` entry's own
 * `tools` map as a model-facing `ctx.tools` entry that runs its `command`
 * through `ctx.subprocess` — never shell-interpreted — with `{name}` argument
 * placeholders substituted from the call. A tool added through the settings
 * form is callable as soon as the write commits.
 *
 * The `tools` seam this registers into is the harness' own tool registry, so a
 * custom tool is indistinguishable from a shipped one to the model: same schema
 * validation, same output contract, same post-execute pipeline.
 * @module agent-tools
 */

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-subprocess";
import type {} from "@deepseek-ai/cordis-plugin-loader";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import type { ParameterSchemaSpec, ValueSchemaSpec } from "@deepseek-ai/dsh-tools";
import {
  ToolsConfig,
  commandArgv,
  type ToolsConfig as ToolsConfigType,
  type ToolSnapshot,
  type ToolParameterSnapshot,
} from "./settings.js";

export type * from "./settings.js";

export const name = "agent-tools";
export const inject = ["subprocess", "tools"];

export const Config = ToolsConfig;

/** The cwd a custom tool runs in: the caller's cwd (paths resolve via the filesystem seam). */
function runCwd(): string {
  return process.cwd();
}

/** Map a config-file parameter spec onto the tool-schema `ValueSchemaSpec` shape. */
function parameterSchema(param: ToolParameterSnapshot): ValueSchemaSpec {
  return {
    type: param.type,
    ...(param.description !== undefined ? { description: param.description } : {}),
  };
}

/** The schema a config-file tool's validated arguments are checked against. */
function parametersSchema(tool: ToolSnapshot): ParameterSchemaSpec {
  const properties: Record<string, ValueSchemaSpec & { required?: true }> = {};
  for (const [name, param] of Object.entries(tool.parameters ?? {})) {
    properties[name] = {
      ...parameterSchema(param),
      ...(param.required === true ? { required: true as const } : {}),
    };
  }
  return properties;
}

/**
 * Run one custom tool command and resolve with the canonical outcome: stdout,
 * stderr, and the exit code. A nonzero exit is a result, not a throw — the
 * model sees the failure text and can react to it.
 */
async function runToolCommand(ctx: Context, argv: string[], signal?: AbortSignal) {
  const spawn = await ctx.subprocess.spawn({
    argv,
    cwd: runCwd(),
    stdio: {
      stdin: { data: "" },
      stdout: { maxBytes: 1_000_000 },
      stderr: { maxBytes: 1_000_000 },
    },
    graceMs: 30_000,
    signal,
  });
  const outcome = await spawn.done;
  return {
    stdout: spawn.collected.stdout?.readFrom(0).text ?? "",
    stderr: spawn.collected.stderr?.readFrom(0).text ?? "",
    exitCode: outcome.exitCode ?? -1,
  };
}

/** One custom tool as a model-facing `ctx.tools` definition. */
function customTool(ctx: Context, name: string, tool: ToolSnapshot) {
  return defineTool({
    name,
    description: tool.description,
    parameters: parametersSchema(tool),
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          stdout: { type: "string", required: true },
          stderr: { type: "string", required: true },
          exitCode: { type: "integer", required: true },
        },
      },
      render: (_args, value) => [
        {
          type: "text",
          text:
            value.exitCode === 0
              ? value.stdout.length > 0
                ? value.stdout
                : `exit ${value.exitCode}`
              : `exit ${value.exitCode}\n${value.stderr.length > 0 ? value.stderr : value.stdout}`,
        },
      ],
    },
    /** execute implementation. */
    async execute(args, exec) {
      const argv = commandArgv(tool, args as Record<string, unknown>);
      return await runToolCommand(ctx, argv, exec.signal);
    },
  });
}

/**
 * Declare this plugin's own settings page, and register the custom tools it
 * currently declares as `ctx.tools` entries.
 *
 * Since 0.2.0 a settings form is not registered: the settings service projects
 * the volatile Config fields of the active profile's entries, so this plugin's
 * own `ToolsConfig` is its form and its namespace is this plugin's entry id.
 *
 * `config.tools` is a live reference the Loader commits each write into, and a
 * volatile-only write is committed without restarting this plugin. The map is
 * therefore read through `.get()` and re-registered on `loader/volatile-update`,
 * so a tool added, edited, or removed through the form takes effect in the same
 * plugin instance. Registering a name the registry already holds in one layer
 * fails, so the previous map is withdrawn before the new one is registered.
 *
 * @param ctx - the plugin context carrying `subprocess` and `tools`.
 * @param config - this entry's Config, carrying the live `tools` reference.
 */
export function apply(ctx: Context, config: ToolsConfigType): void {
  declareCustomSettingsPage(ctx);

  const registered = new Map<string, () => void>();
  /** Withdraw every tool this entry registered, so a volatile commit can re-register cleanly. */
  const withdrawTools = (): void => {
    for (const dispose of registered.values()) dispose();
    registered.clear();
  };
  /** Register the configured custom tools, withdrawing the previous set first. */
  const registerTools = (): void => {
    withdrawTools();
    for (const [name, tool] of Object.entries(config.tools.get())) {
      registered.set(name, ctx.tools.register(customTool(ctx, name, tool)));
    }
  };

  ctx.effect(() => {
    registerTools();
    return withdrawTools;
  });
  ctx.on("loader/volatile-update", registerTools);
}
