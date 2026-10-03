/**
 * tweak-fork-undo settings: the fork-based undo/redo section schema.
 * @module tweak-fork-undo/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Namespace of the fork-undo section — this plugin's own Loader entry id. */
export const NS_FORK_UNDO = settingsNamespace("tweak-fork-undo");

/** Fork-undo knobs. */
export interface ForkUndoConfig {
  /** Whether `/undo` `/redo` fork commands are registered. */
  enabled: boolean;
}

export const ForkUndoConfig: z<ForkUndoConfig> = z.object({
  enabled: z.boolean().default(true),
});
