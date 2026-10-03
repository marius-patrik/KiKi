/**
 * formatters settings: this plugin's own `Config` IS its settings form. Since
 * 0.2.0 a form is not registered — the settings service projects the volatile
 * Config fields of the active profile's entries, so the namespace is this
 * plugin's entry id and `FormatterConfig` is the form. The plugin exposes a
 * model-facing `format` tool over the formatter table and reformats files on
 * `edit` / `write` (via the `tools/post-execute` waterfall) when auto-format is
 * on.
 * @module formatters/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Settings namespace owning the formatter table — this plugin's own Loader entry id. */
export const NS = settingsNamespace("formatters");

/**
 * One formatter command: argv[0] is the executable (absolute, or on PATH),
 * the rest are fixed arguments. No shell interpretation.
 */
export interface FormatterCommand {
  /** Executable and fixed arguments; `argv[0]` is the program. */
  argv: string[];
}

export const FormatterCommand: z<FormatterCommand> = z.object({
  argv: z.array(String).required(),
});

/**
 * The plugin's own configuration, which is also its settings form: extension →
 * formatter command, plus the auto-format-on-edit toggle (default on).
 */
export interface FormatterConfig {
  /** Lowercase leading-dot extension (e.g. `.ts`) → formatter command. */
  formatters?: Record<string, FormatterCommand>;
  /** Reformat the target file after every successful `edit`/`write`. */
  autoFormatOnEdit?: boolean;
}

export const FormatterConfig: z<FormatterConfig> = z.object({
  formatters: z.dict(FormatterCommand).default({}),
  autoFormatOnEdit: z.boolean().default(true),
});

/** Pick the formatter command for an extension, if one is configured. */
export function formatterFor(
  config: FormatterConfig | undefined,
  ext: string,
): FormatterCommand | undefined {
  return config?.formatters?.[ext];
}

/** Whether auto-format is on. */
export function autoFormatEnabled(config: FormatterConfig | undefined): boolean {
  return config?.autoFormatOnEdit ?? true;
}
