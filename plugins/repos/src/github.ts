/**
 * GitHub API access for repos: credential resolution and the PR/remote
 * plumbing. The token comes from the shared vault (`ctx.accounts` — repos
 * never stores credentials itself), so the API surface here stays thin: resolve
 * the token once per operation, then hand it to git (push) or the GitHub REST
 * API (PR creation) without ever writing it to disk.
 *
 * `env` may carry `GITHUB_OAUTH_TOKEN` as a fallback so the plugin also works
 * in deployments without credentials. All other GitHub credential entry
 * points are deliberately absent — this plugin is not a credential store.
 * @module repos/github
 */

import type { Context } from "@deepseek-ai/cordis";

/** The canonical vault reference this plugin resolves for GitHub. */
export const GITHUB_OAUTH_REF = "GITHUB_OAUTH_TOKEN";

/** A resolved GitHub credential: the bearer token plus the account it belongs to, when known. */
export interface GitHubCredential {
  token: string;
  account: string | null;
}

/**
 * Resolve the GitHub token for one operation: `ctx.accounts` vault first, then
 * the `GITHUB_OAUTH_TOKEN`/`GH_TOKEN` environment fallback.
 * @returns the resolved token, or null when none is available.
 */
export async function resolveGitHubToken(
  ctx: Context,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string | null> {
  const accounts = (
    ctx as {
      get?: (
        name: string,
      ) => { resolve: (ref: string) => Promise<{ value: string } | undefined> } | undefined;
    }
  ).get?.("accounts");
  if (accounts !== undefined) {
    const hit = await accounts.resolve(GITHUB_OAUTH_REF);
    if (hit !== undefined && hit.value.length > 0) return hit.value;
  }
  for (const key of ["GITHUB_OAUTH_TOKEN", "GH_TOKEN"] as const) {
    const value = env[key];
    if (value !== undefined && value.length > 0) return value;
  }
  return null;
}

/** GitHub's api.github.com REST root. */
export const GITHUB_API_BASE = "https://api.github.com";

/** One authenticated fetch against the GitHub REST API. */
async function githubFetch(
  url: string,
  token: string,
  options: { method: string; body?: unknown },
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "repos",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return { status: response.status, body: await response.text() };
}

/** A pull-request creation request. */
export interface CreatePullRequestInput {
  /** `owner/repo` of the target repository. */
  ownerRepo: string;
  /** The branch whose commits go into the PR. */
  head: string;
  /** The branch the PR merges into. */
  base: string;
  /** The PR title. */
  title: string;
  /** The PR body. */
  body?: string;
  /** REST root override (defaults to `GITHUB_API_BASE`; used by tests). */
  apiBase?: string;
}

/** The URL of a created pull request, or null on a non-2xx response. */
export async function createPullRequest(
  token: string,
  input: CreatePullRequestInput,
): Promise<string | null> {
  const base = input.apiBase ?? GITHUB_API_BASE;
  const { status, body } = await githubFetch(`${base}/repos/${input.ownerRepo}/pulls`, token, {
    method: "POST",
    body: {
      title: input.title,
      head: input.head,
      base: input.base,
      ...(input.body !== undefined && input.body.length > 0 ? { body: input.body } : {}),
    },
  });
  if (status < 200 || status >= 300) {
    throw new Error(`GitHub: creating PR in ${input.ownerRepo} failed (${status}): ${body}`);
  }
  const parsed = JSON.parse(body) as { html_url?: string } | null;
  return parsed?.html_url ?? null;
}
