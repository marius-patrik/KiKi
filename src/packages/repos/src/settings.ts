/**
 * repos settings: the `repos` Config owns the repo workflow defaults (default
 * remote and branch) and is itself the settings form — since 0.2.0 the settings
 * service projects a plugin's own Config from the active profile's entries, so
 * there is no second section schema and the namespace is this plugin's entry
 * id. The plugin exposes model-facing repo tools (`repo-status`, `repo-branch`,
 * `repo-commit`, `repo-push`, `repo-pr`) that run `git` through
 * `ctx.subprocess`; GitHub pushes and PRs consume the vault token resolved by
 * credentials — this plugin never stores credentials.
 * @module repos/settings
 */

import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Settings namespace of the repo workflow defaults — this plugin's own entry id. */
export const NS = settingsNamespace("repos");

/** The plugin's configuration, which is also its settings form. */
export interface RepoConfig {
  /** Default remote name for push and PR tools (default `origin`). */
  remote?: string;
  /** Default base branch for PRs when the target is not stated (default `main`). */
  defaultBaseBranch?: string;
}

export const RepoConfig: z<RepoConfig> = z.object({
  remote: z.string().default("origin"),
  defaultBaseBranch: z.string().default("main"),
});

/**
 * The default remote to push and open PRs against.
 * @param config - the plugin's projected Config fields, absent before first load.
 * @returns the configured remote, or `origin` when none is configured.
 */
export function defaultRemote(config: RepoConfig | undefined): string {
  return config?.remote ?? "origin";
}

/**
 * The base branch a pull request targets when the call does not name one.
 * @param config - the plugin's projected Config fields, absent before first load.
 * @returns the configured base branch, or `main` when none is configured.
 */
export function defaultBaseBranch(config: RepoConfig | undefined): string {
  return config?.defaultBaseBranch ?? "main";
}
