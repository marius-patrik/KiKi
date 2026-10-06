/**
 * `tweak-drag-drop`: the image drag-drop settings surface — the
 * `tweaks-drag-drop` section (enable + max image bytes) consumed by the
 * client attachment seam. Split out of the bundled `tweaks` package.
 * @module tweak-drag-drop
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { declareCustomSettingsPage, settingsNamespace } from "@dsh-stack/plugin-kit";

/** Namespace of the drag-drop section — this plugin's own Loader entry id. */
export const NS_DRAG_DROP = settingsNamespace("tweak-drag-drop");

/** Drag-drop knobs. */
interface DragDropConfig {
  /** Whether image drag-drop is enabled (wires the attachment seam). */
  enabled: boolean;
  /** Max image bytes accepted from drag-drop (mirrors the attachment seam). */
  maxImageBytes: number;
}

const DragDropSchema: z<DragDropConfig> = z.object({
  enabled: z.boolean().default(true),
  maxImageBytes: z
    .natural()
    .min(1)
    .default(8 * 1024 * 1024),
});

export const name = "tweak-drag-drop";
export const inject: string[] = [];

/** The drag-drop extension config: the drag-drop section itself. */
export type Config = DragDropConfig;

export const Config: z<Config> = DragDropSchema;

/**
 * Declare this plugin's settings surface as its own page.
 *
 * The drag-drop form is the `DragDropSchema` this plugin already declares, and
 * its namespace is this plugin's entry id, so there is nothing to install. The
 * knobs carry their defaults in the schema, and the settings service validates a
 * write against that schema alone, so no server-side wiring is needed.
 *
 * @param ctx - the calling plugin's context.
 * @param config - the active profile's projected drag-drop fields.
 */
export function apply(ctx: Context, config: Config): void {
  declareCustomSettingsPage(ctx);
}
