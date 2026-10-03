/**
 * repos settings: the `repos` entry's own Config schema, which is its settings
 * form. Both fields are the operator's own choice rather than a deployment fact,
 * so both are declared `.volatile()` and are the only fields the settings
 * service projects for this entry — an entry with no volatile field is omitted
 * from `describe()` and refuses writes. The plugin exposes model-facing repo
 * tools (`repo-status`, `repo-branch`, `repo-commit`, `repo-push`, `repo-pr`)
 * that run `git` through `ctx.subprocess`; GitHub pushes and PRs consume the
 * vault token resolved by credentials — this plugin never stores credentials.
 * @module repos/settings
 */

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@dsh-stack/plugin-kit";

/** Settings namespace of the repo workflow defaults — this plugin's own entry id. */
export const NS = settingsNamespace("repos");

/** The plugin's configuration, which is also its settings form. */
export interface RepoConfig {
  /**
   * Default remote name for push and PR tools, held as a live reference: the
   * Loader commits every settings write into this same object, so read it with
   * `.get()` at each use rather than capturing the value once.
   */
  remote: Volatile<string>;
  /**
   * Default PR base branch, held as a live reference on the same terms as
   * {@link RepoConfig.remote}.
   */
  defaultBaseBranch: Volatile<string>;
}

export const RepoConfig = z.object({
  // A deployment serves whatever repository the caller names, and a fork names
  // its remote `fork`/`upstream` where an origin clone names it `origin`, so the
  // name to push to is the operator's per-repository choice — not a fact about
  // this installation. Volatile so the settings page can change it live.
  remote: z.string().default("origin").volatile(),
  // The integration branch a PR targets is `main`, `master` or `trunk`
  // depending on the repository, and the caller may push from a detached topic
  // branch that names no base at all. Volatile for the same reason as `remote`.
  defaultBaseBranch: z.string().default("main").volatile(),
});

/**
 * The default remote to push and open PRs against.
 * @param config - this entry's projected Config, carrying the live `remote` reference.
 * @returns the currently configured remote, or `origin` when none is set.
 */
export function defaultRemote(config: RepoConfig): string {
  return config.remote?.get() ?? "origin";
}

/**
 * The base branch a pull request targets when the call does not name one.
 * @param config - this entry's projected Config, carrying the live `defaultBaseBranch` reference.
 * @returns the currently configured base branch, or `main` when none is set.
 */
export function defaultBaseBranch(config: RepoConfig): string {
  return config.defaultBaseBranch?.get() ?? "main";
}
