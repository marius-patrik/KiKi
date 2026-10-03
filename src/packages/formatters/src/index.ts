/**
 * `formatters`: owns file formatting on the web profile. The harness web
 * UI is read-only, so this plugin works through the seams the agent uses to
 * write: a model-facing `format` tool over per-extension formatter commands
 * (`prettier`, `black`, `gofmt`, ...) and, when enabled, automatic reformatting
 * after every successful `edit`/`write` via the `tools/post-execute` waterfall.
 * Formatters run through `ctx.subprocess` — never shell-interpreted. The
 * `dsh formatter` CLI (bin/formatter.mjs) manages this plugin's settings form.
 * @module formatters
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@deepseek-ai/dsh-fs";
import type {} from "@deepseek-ai/dsh-subprocess";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import {
  FormatterConfig,
  formatterFor,
  autoFormatEnabled,
  type FormatterConfig as FormatterConfigType,
} from "./settings.js";
import { formatFile, resolveTarget, targetPathFromArguments } from "./format.js";

export type * from "./settings.js";
export type * from "./format.js";

export const name = "formatters";
export const inject = ["fs", "subprocess", "tools"];

export const Config: z<FormatterConfig> = FormatterConfig;

/**
 * Pick the formatter command for a path's extension, if one is configured.
 */
function commandFor(config: FormatterConfigType | undefined, path: string) {
  const ext = path.toLowerCase().slice(path.lastIndexOf(".")).trimEnd();
  if (!ext.startsWith(".")) return undefined;
  return formatterFor(config, ext);
}

/**
 * Declare this plugin's settings surface and register the formatting seams.
 *
 * Since 0.2.0 no settings form is registered: the settings service projects the
 * volatile Config fields of the active profile's entries, so this plugin's own
 * `FormatterConfig` is its form and its namespace is its entry id `formatters`.
 * All that is left to declare is that this plugin ships its own page for that
 * form. The formatter table and the auto-format toggle are therefore read
 * straight off the `config` this entry was applied with — the separate
 * `settings.get(formatters)` scope they used to come from no longer exists, and
 * nothing mirrors it into a mutable module-level copy.
 *
 * @param ctx - the plugin context carrying `fs`, `subprocess`, and `tools`.
 * @param config - the `formatters` profile entry this plugin was applied with:
 *   the per-extension formatter table and the auto-format-on-edit toggle.
 */
export function apply(ctx: Context, config: FormatterConfigType): void {
  declareCustomSettingsPage(ctx);

  ctx.tools.register(
    defineTool({
      name: "format",
      description:
        "Format a file with its configured formatter (prettier, black, gofmt, ...). Returns the before and after content when the formatter changed the file.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Path of the file to format, resolved by the filesystem backend.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string", required: true },
            before: { type: "string", required: true },
            after: { type: "string", required: true },
          },
        },
        render: (args, value) => [
          {
            type: "text",
            text:
              value.before === value.after
                ? `The file ${value.path} is already formatted.`
                : `The file ${value.path} has been formatted.`,
          },
        ],
      },
      /** execute implementation. */
      async execute(args, exec) {
        const command = commandFor(config, args.path);
        if (!command)
          throw new Error(
            `no formatter configured for "${args.path}" — add one via \`dsh formatter add <ext> <command>\``,
          );
        const target = await resolveTarget(ctx, args.path, exec.signal);
        if (!target) throw new Error(`cannot resolve ${args.path}`);
        return await formatFile(ctx, target, command, exec.signal);
      },
    }),
  );

  ctx.on("tools/post-execute", async (exec, _result, next) => {
    if (!autoFormatEnabled(config)) return next();
    if (exec.name !== "edit" && exec.name !== "write") return next();
    const rawPath = targetPathFromArguments(exec.arguments);
    if (!rawPath) return next();
    const command = commandFor(config, rawPath);
    if (!command) return next();
    try {
      const target = await resolveTarget(ctx, rawPath, exec.signal);
      if (!target) return next();
      const outcome = await formatFile(ctx, target, command, exec.signal);
      if (outcome.before === outcome.after) return next();
      const downstream = await next();
      const note =
        `[auto-format] ${outcome.path} was reformatted after ${exec.name}:\n` +
        `before:\n${outcome.before}\nafter:\n${outcome.after}`;
      const noteMessage = createUserMessage({
        content: [{ type: "text", text: note }],
        source: { kind: "plugin", plugin: "formatters" },
      });
      return {
        ...downstream,
        additionalContexts: [noteMessage, ...(downstream.additionalContexts ?? [])],
      };
    } catch (error: unknown) {
      ctx.logger.warn(
        `formatters: auto-format failed for ${rawPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return next();
    }
  });
}
