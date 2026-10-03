/**
 * agent-tools settings: the `agent-tools` section owns the config-file custom tool
 * registry — a map of tool name → definition. Each definition carries a
 * description, an optional parameter schema, and the `argv` to run (through
 * `ctx.subprocess`, never shell-interpreted). `{name}` placeholders in the
 * argv are substituted with the corresponding argument value at call time.
 *
 * The harness ships a rich fixed toolset; this registry is for tools that are
 * personal and ephemeral — wrapper scripts, project-specific commands, or a
 * one-off CLI the agent should reach without a new plugin. Changes apply on
 * the next boot (the `dsh tool` CLI manages the section).
 * @module agent-tools/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Settings namespace of the custom tool registry — this plugin's own Loader entry id. */
export const NS = settingsNamespace("agent-tools");

/** One custom tool parameter: its JSON type and whether the model must supply it. */
export interface ToolParameter {
  /** JSON Schema primitive type for the argument value. */
  type: "string" | "number" | "boolean";
  /** Human-readable description of the parameter. */
  description?: string;
  /** Whether the parameter is required for a call. */
  required?: boolean;
}

export const ToolParameter: z<ToolParameter> = z.object({
  type: z.union([z.const("string"), z.const("number"), z.const("boolean")]),
  description: z.string(),
  required: z.boolean(),
});

/** One custom tool definition from the config file. */
export interface ToolConfig {
  /** What the model sees this tool doing. */
  description: string;
  /** Optional parameter schema; argument placeholders are `{name}` in `command`. */
  parameters?: Record<string, ToolParameter>;
  /**
   * The command to run: argv[0] is the executable (absolute, or on PATH), the
   * rest are fixed arguments. `{name}` placeholders are substituted with the
   * argument value. Never shell-interpreted.
   */
  command: string[];
}

export const ToolConfig: z<ToolConfig> = z.object({
  description: z.string(),
  parameters: z.dict(ToolParameter).default({}),
  command: z.array(String).required(),
});

/**
 * The plugin's entry configuration, and with it the settings form the settings
 * service projects: tool name → definition. Since 0.2.0 a settings write lands
 * in this entry's configuration and the Loader re-applies the plugin with it, so
 * the resolved config this plugin receives is its current settings.
 */
export interface ToolsConfig {
  /** Custom tools registered as model-facing tools. */
  tools: Record<string, ToolConfig>;
}

export const ToolsConfig: z<ToolsConfig> = z.object({
  tools: z.dict(ToolConfig).default({}),
});

/**
 * Substitute `{name}` placeholders in one argv entry with the matching
 * argument value. A placeholder with no argument resolves to an empty string;
 * values are stringified (booleans and numbers render losslessly).
 */
export function substitutePlaceholder(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    const value = args[name];
    if (value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  });
}

/**
 * Build the full argv for a tool call: every entry goes through
 * `substitutePlaceholder`, so `{name}` in fixed arguments or a whole
 * `['{path}']` command both work.
 */
export function commandArgv(tool: ToolConfig, args: Record<string, unknown>): string[] {
  return tool.command.map((entry) => substitutePlaceholder(entry, args));
}
