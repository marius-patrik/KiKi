/**
 * formatters settings: this plugin's own `Config` IS its settings form. Since
 * 0.2.0 a form is not registered — the settings service projects only the
 * volatile Config fields of the active profile's entries. An entry whose Config
 * has no volatile field is therefore omitted from `describe()` entirely and
 * every write to it is refused with `Plugin entry "formatters" has no volatile
 * fields`, so both of this plugin's fields are declared `.volatile()` and are
 * read back through their live reference at each use.
 *
 * Unlike `themes`, which keeps its directory and catalog base plain because
 * those are deployment facts, this Config has no deployment-fact field: every
 * knob in it is something the user chooses. The plugin exposes a model-facing
 * `format` tool over the formatter table and reformats files on `edit` /
 * `write` (via the `tools/post-execute` waterfall) when auto-format is on.
 * @module formatters/settings
 */

import type { Volatile, VolatileSnapshot } from "@deepseek-ai/cordis";
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
 * One formatter command as a settings write hands it back: the deeply frozen,
 * read-only snapshot of a volatile field.
 */
export type FormatterCommandView = VolatileSnapshot<FormatterCommand>;

/**
 * The formatter table. Spelled structurally rather than left to `z.dict`, whose
 * output type is cosmokit's `Dict` and cannot be named in this package's emitted
 * declaration without reaching for an undeclared dependency.
 */
export type FormatterTable = { [ext: string]: FormatterCommand };

/**
 * The plugin's own configuration, which is also its settings form. Every field
 * is a live reference: the Loader commits each settings write into this same
 * object rather than remounting the plugin, so a field is read with `.get()` at
 * each use and never captured as a value at boot.
 */
export interface FormatterConfig {
  /**
   * Lowercase leading-dot extension (e.g. `.ts`) → formatter command. Volatile
   * because the answer is machine-local: which formatter exists and under what
   * name (`black`, `ruff format`, `npx prettier --write`) differs per
   * workstation, so no deployment can pin one correct table and the user owns
   * it. It is volatile as one whole-object node because schemastery rejects
   * references nested inside a dictionary, and a form write can only address a
   * path lying under a volatile node — a reference per table entry could be
   * neither declared nor edited.
   */
  formatters: Volatile<FormatterTable>;
  /**
   * Reformat the target file after every successful `edit`/`write`. Volatile
   * because it is a workflow preference — whether the agent rewrites your files
   * after every edit is the user's call, not a deployment's, and `dsh
   * formatter set-auto` is already the user's own verb over it. The schema
   * default is the deployment's initial preference, not a constraint.
   */
  autoFormatOnEdit: Volatile<boolean>;
}

/**
 * Both fields are annotated with their `"volatile-defined"` mode rather than
 * left to inference. A `Volatile` field's output type is `Volatile<T>`, which the
 * `z<FormatterConfig>` annotation the plain form used cannot express (TS2322 —
 * the annotation is invariant); and leaving the object to inference strands
 * cosmokit's `Dict` in the emitted declaration (TS2742). Pinning the mode has a
 * second payoff: dropping a `.volatile()` from either field is then a compile
 * error rather than a silent loss of the settings form. The interface above is
 * the authoritative shape, as in `themes`.
 */
const volatileFormatterTable: z<FormatterTable, FormatterTable, "volatile-defined"> = z
  .dict(FormatterCommand)
  .default({})
  .volatile();

const volatileAutoFormatOnEdit: z<boolean, boolean, "volatile-defined"> = z
  .boolean()
  .default(true)
  .volatile();

/** This plugin's own Config, which the settings service projects as its form. */
export const FormatterConfig = z.object({
  formatters: volatileFormatterTable,
  autoFormatOnEdit: volatileAutoFormatOnEdit,
});

/**
 * Pick the formatter command for an extension from the live table, if one is
 * configured. Reads the volatile field at call time, so a settings write takes
 * effect without re-applying the plugin.
 */
export function formatterFor(
  config: FormatterConfig | undefined,
  ext: string,
): FormatterCommandView | undefined {
  const table = config?.formatters?.get();
  return table?.[ext];
}

/** Whether auto-format is on, read from the live toggle at call time. */
export function autoFormatEnabled(config: FormatterConfig | undefined): boolean {
  return config?.autoFormatOnEdit?.get() ?? true;
}
