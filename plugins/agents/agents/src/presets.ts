/**
 * Agent preset resources: the abstraction that concrete preset extensions
 * (e.g. `agent-preset-default`, `agent-preset-coding`) plug into. A preset
 * resource carries the raw `agent.cordis.yml` composition text that
 * materializes into a DSH agent-preset discovery root.
 * @module agents/presets
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** One agent preset resource: a stable id plus its composition text. */
export interface AgentPresetResource {
  readonly id: string;
  readonly composition: string;
}

/** A bundle of preset resources materialized together. */
export interface AgentPresetPack {
  readonly id: string;
  readonly presets: readonly AgentPresetResource[];
}

/**
 * Materialize a preset pack directly into a DSH agent-preset root.
 * `root` is expected to be configured as one of the DSH preset discovery
 * roots; each preset therefore lives at `<root>/<preset-id>/agent.cordis.yml`.
 */
export async function materializeAgentPresetPack(
  root: string,
  pack: AgentPresetPack,
): Promise<string> {
  await mkdir(root, { recursive: true });
  for (const preset of pack.presets) {
    const dir = join(root, preset.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "agent.cordis.yml"), preset.composition, "utf8");
  }
  return root;
}
