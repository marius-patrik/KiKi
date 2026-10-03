/**
 * `tweaks`: the user-facing harness tweaks surface — the `tweaks` entry's own
 * settings form and its mirror into every agent home's settings document. The
 * session-UX features that v1 bundled here now live in dedicated extensions
 * plugging into this surface: `tweak-share-links`, `tweak-stats`,
 * `tweak-plan-toggle`, `tweak-fork-undo`, `tweak-drag-drop`,
 * `tweak-slash-commands`, and `tweak-keybinds`.
 * @module tweaks
 */

import type { Context } from "@deepseek-ai/cordis";
import { declareCustomSettingsPage } from "@dsh-stack/plugin-kit";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  normalizeSection,
  readTweaksSection,
  sectionsEqual,
  writeTweaksSection,
} from "./mirror.js";
import type { TweaksSection } from "./mirror.js";
import { TweaksConfig, type TweaksConfig as TweaksConfigType } from "./settings.js";

export {
  normalizeSection,
  readTweaksSection,
  sectionsEqual,
  writeTweaksSection,
} from "./mirror.js";
export type { TweaksSection } from "./mirror.js";
export type { TweaksConfig } from "./settings.js";
export { NS } from "./settings.js";

export const name = "tweaks";
export const inject: string[] = [];

const DEFAULT_HOME = join(homedir(), ".agents");

/** The agent home this run boots under. */
export function resolveHome(): string {
  return resolve(process.env["DSH_HOME"] ?? DEFAULT_HOME);
}

/**
 * The `tweaks` entry's configuration, which is also its settings form. Neither
 * field is volatile, so this is declared through the `TweaksConfig` annotation
 * rather than left to inference (see `settings.ts` for why).
 */
export const Config = TweaksConfig;

/**
 * Mirror the effective `tweaks` (homeRoot/command) section into the settings
 * document of every agent home (see `mirror.ts`). The launcher reads only this
 * top-level section; the tweak extension sections live under their own namespaces
 * the web Settings UI edits directly.
 *
 * @param currentHome - the agent home this run booted under.
 * @param section - the effective section, as this entry's Config declares it.
 * @param log - the logger warnings about an unreachable home are reported to.
 * @returns a promise settling once every target home has been written or skipped.
 */
export function mirrorTweaks(
  currentHome: string,
  section: TweaksSection,
  log: Pick<Context["logger"], "warn">,
): Promise<void> {
  const effective = normalizeSection(section);
  if (Object.keys(effective).length === 0) return Promise.resolve();
  const targets = new Set<string>([currentHome, DEFAULT_HOME]);
  return Promise.all(
    [...targets].map(async (home) => {
      const path = join(home, "settings.yaml");
      try {
        const existing = await readTweaksSection(path);
        if (sectionsEqual(existing, effective)) return;
        await writeTweaksSection(path, effective);
      } catch (error) {
        log.warn(`tweaks: could not mirror settings to ${path}`);
        log.warn(error);
      }
    }),
  ).then(() => undefined);
}

/**
 * Declare this plugin's settings page and bootstrap the launcher-visible
 * settings document.
 *
 * Since 0.2.0 no settings form is registered: the settings service projects the
 * volatile Config fields of the active profile's entries, and this entry declares
 * none, so `TweaksConfig` yields no form and every write to this entry is refused.
 * That is the correct outcome — the settings shell this package ships edits its own
 * `localStorage`-backed rows (see `client.js`), never these two fields — and what
 * is left to declare is that this plugin ships its own page regardless.
 *
 * The second namespace this plugin used to hand-mint, `ui-onboarding`, is gone
 * rather than folded in. At 0.2.0 a namespace is a Loader entry id and one entry
 * yields exactly one form, so a second one has no home: `SettingsForms.write`
 * resolves a namespace through `configEditor.entries()` and would refuse every
 * write naming an id no entry carries. Its single field, `welcomeNoticeVersion`,
 * is in any case not a user choice — it is a version stamp the harness's own
 * `ui-settings-models` writes under `ui-settings-general` when a notice is
 * dismissed — and the Stack never reaches that writer, because this package's
 * `TweaksWelcomeNoticeOverride` shadows the `welcome-notice` onboarding step at a
 * lower priority and persists the acknowledgement to `localStorage` instead.
 *
 * `config` is read once, per mount. There is no `setSource` mirror to rewire: no
 * volatile field exists, so a settings change that reaches these values is an
 * ordinary one, and the Loader remounts this entry — which re-runs the mirror
 * below against the new Config.
 *
 * @param ctx - the plugin's context.
 * @param config - the `tweaks` profile entry this plugin was applied with.
 */
export function apply(ctx: Context, config: TweaksConfigType): void {
  declareCustomSettingsPage(ctx);
  // The launcher reads settings.yaml before this process exists, so the mirror
  // must run even when no settings service is mounted: it bootstraps the
  // document for the next launch.
  void mirrorTweaks(resolveHome(), config, ctx.logger);
}
