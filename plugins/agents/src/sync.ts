/**
 * Materialization: the persona authoring directory (`<dshHome>/agents`, or a
 * configured root) to the harness's user preset root (`<dshHome>/.agent-presets`).
 *
 * The harness discovers presets live on every roster read, so writing a
 * preset directory IS the integration point — no harness service is required,
 * and agents composes nothing itself. A materialized preset carries the
 * base composition with a neutral persona row; the live persona is resolved
 * by the `persona:policy` prompt section, never by embedded text. Each
 * materialized preset is marked
 * with a `.agents-source` file naming its persona file; sync prunes ONLY
 * marked presets whose source is gone, so a hand-authored preset in the same
 * root is never touched.
 *
 * The base composition comes from the shipped preset declarations beside the
 * installed harness (overridable with `DSH_AGENTS_BASE_DIR`); when the harness
 * checkout is not reachable, materialization degrades to the bare persona row.
 * @module agents/sync
 */

import { mkdir, readdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { composeComposition, composeMetadata } from "./compose.js";
import { parsePersona, type Persona } from "./persona.js";

/** The user preset root the harness scans for locally authored presets. */
export const PRESET_ROOT = ".agent-presets";

/** Marker naming the persona file a materialized preset was derived from. */
export const SOURCE_MARKER = ".agents-source";

/** The authoring file extensions agents turns into presets. */
const PERSONA_EXTENSIONS = new Set([".md", ".json"]);

/** One materialized preset's report entry. */
export interface Materialized {
  id: string;
  /** Absolute path of the persona file it was derived from. */
  source: string;
  /** Base preset id composed from, or undefined for the bare persona row. */
  base: string | undefined;
}

/** The summary `syncPersonas` resolves with. */
export interface SyncReport {
  materialized: Materialized[];
  pruned: string[];
  failed: string[];
}

/**
 * The shipped preset declarations: `DSH_AGENTS_BASE_DIR` when set, else the
 * `DSH/packages/bundle/web-app/presets` tree beside this package's checkout
 * (four levels up from `lib/`, since packages live under `src/`). Returns
 * undefined when neither resolves, which degrades materialization to the bare
 * persona row.
 *
 * Moved here from `DSH/apps/cli/config/agent-presets` by harness commit
 * f94495e527 ("bundle the shipped presets inside dsh-agent-presets"), then
 * again by the 0.2.0 move out of `packages/preset/agent-presets/presets`: a
 * shipped preset is now one `@deepseek-ai/dsh-agent-preset` declaration in the
 * web-app bundle, `<id>.patch.yml`.
 */
export function basePresetDir(): string | undefined {
  if (process.env.DSH_AGENTS_BASE_DIR !== undefined && process.env.DSH_AGENTS_BASE_DIR !== "") {
    return process.env.DSH_AGENTS_BASE_DIR;
  }
  return new URL("../../../DSH/packages/bundle/web-app/presets", import.meta.url).pathname;
}

/** Leading spaces of a line, or the whole line when it carries no other text. */
function indentOf(line: string): number {
  return (/^ */.exec(line)?.[0] ?? line).length;
}

/**
 * One shipped preset's plugin entry list, taken verbatim out of its bundle
 * declaration. The declaration nests the entry list under the preset row's
 * `config.plugins`, so the block is dedented by its own indentation rather than
 * re-serialized: the harness's dialect carries `!!js` expressions and `{{...}}`
 * template strings that must round-trip byte for byte.
 * @param declaration - the `<id>.patch.yml` text.
 * @returns the entry list, or undefined when the declaration carries none.
 */
function entryListFromDeclaration(declaration: string): string | undefined {
  const rows: string[] = [];
  let rowIndent: number | undefined;
  for (const line of declaration.split("\n")) {
    if (rowIndent === undefined) {
      if (/^ *plugins: *$/.test(line)) rowIndent = indentOf(line) + 2;
      continue;
    }
    if (line.trim() === "") {
      rows.push("");
      continue;
    }
    if (indentOf(line) < rowIndent) break;
    rows.push(line.slice(rowIndent));
  }
  while (rows.at(-1) === "") rows.pop();
  const firstRow = rows.find((row) => row !== "" && !row.startsWith("#"));
  if (firstRow === undefined || !firstRow.startsWith("- ")) return undefined;
  return `${rows.join("\n")}\n`;
}

/**
 * Read a base preset's composition as an `agent.cordis.yml` entry list, or
 * undefined when the shipped declaration is absent or carries no entry list.
 */
export async function readBaseComposition(
  baseDir: string,
  base: string,
): Promise<string | undefined> {
  try {
    return entryListFromDeclaration(await readFile(join(baseDir, `${base}.patch.yml`), "utf8"));
  } catch {
    return undefined;
  }
}

/** Write one file atomically (tmp + rename) so the roster never reads half a preset. */
async function atomicWrite(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, content);
  await rename(tmp, target);
}

/**
 * Materialize one persona as an agent preset under `<home>/.agent-presets/`.
 * The preset directory is written atomically (composition, metadata, then the
 * source marker, which is what makes it eligible for pruning).
 * @param home - the dsh home (the preset root lives beneath it).
 * @param persona - the parsed persona.
 * @param source - the persona file it was parsed from (recorded for pruning).
 * @param baseDir - the shipped preset root; absent uses the bare persona row.
 */
export async function materializePreset(
  home: string,
  persona: Persona,
  source: string,
  baseDir: string | undefined,
): Promise<Materialized> {
  const baseId = persona.base ?? "standard";
  const baseComposition =
    baseDir !== undefined ? await readBaseComposition(baseDir, baseId) : undefined;
  const directory = join(home, PRESET_ROOT, persona.id);
  await mkdir(directory, { recursive: true });
  await atomicWrite(join(directory, "agent.cordis.yml"), composeComposition(baseComposition));
  await atomicWrite(join(directory, "preset.yml"), composeMetadata(persona));
  await atomicWrite(join(directory, SOURCE_MARKER), `${source}\n`);
  return { id: persona.id, source, base: baseComposition !== undefined ? baseId : undefined };
}

/**
 * Synchronize the authoring directory into the user preset root: materialize
 * every parseable persona file, and prune materialized presets whose marked
 * source file no longer exists. Unparsable files are reported, never fatal.
 * @param home - the dsh home.
 * @param root - the authoring directory.
 * @param baseDir - the shipped preset root; absent uses the bare persona row.
 */
export async function syncPersonas(
  home: string,
  root: string,
  baseDir: string | undefined,
): Promise<SyncReport> {
  const report: SyncReport = { materialized: [], pruned: [], failed: [] };
  let files: string[];
  try {
    files = await readdir(root);
  } catch {
    return report;
  }

  for (const file of files) {
    const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (!PERSONA_EXTENSIONS.has(extension)) continue;
    const source = join(root, file);
    let persona: Persona;
    try {
      persona = parsePersona(source, await readFile(source, "utf8"));
    } catch (error) {
      report.failed.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    report.materialized.push(await materializePreset(home, persona, source, baseDir));
  }

  const presetRoot = join(home, PRESET_ROOT);
  try {
    for (const id of await readdir(presetRoot)) {
      const marker = join(presetRoot, id, SOURCE_MARKER);
      let source: string;
      try {
        source = (await readFile(marker, "utf8")).trim();
      } catch {
        continue;
      }
      if (await pathExists(source)) continue;
      await rm(join(presetRoot, id), { recursive: true, force: true });
      report.pruned.push(id);
    }
  } catch {
    // No preset root yet: nothing to prune.
  }
  return report;
}

/** Whether a path exists on disk. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}
