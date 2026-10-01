# repos

Repo workflows (status / branch / commit / push / PR) for the dsh harness.

All `git` commands run through `ctx.subprocess` — never shell-interpreted —
against the working directory the caller names. GitHub pushes and PRs resolve
the bearer token from the shared vault (`ctx.accounts`), or the
`GITHUB_OAUTH_TOKEN` / `GH_TOKEN` environment fallback; this plugin never stores
credentials.

## Model-facing tools

- `repo-status` — current branch, staged/unstaged/untracked files
- `repo-branch` — list, create, switch, delete branches
- `repo-commit` — stage (all or specific paths) and commit with a message
- `repo-push` — push a branch to a remote, authenticated with the vault GitHub
  token (`--force-with-lease` on request)
- `repo-pr` — open a pull request for the current branch via the GitHub REST
  API, authenticated with the vault token

## Owner CLI

`dsh repos` manages the `repos` settings section and runs the same git
verbs locally:

```
dsh repos list
dsh repos set <remote|defaultBaseBranch> <value>
dsh repos status [path]
dsh repos branch [create|switch|delete <name>] [path]
dsh repos commit <path> <message>
```

## Settings

The `repos` section of `settings.yaml`:

- `remote` — default remote name (default `origin`)
- `defaultBaseBranch` — default PR base branch (default `main`)

## Build

```sh
bun run build       # tsc -> lib/
bun run test        # node check-plugin.mjs (real git round-trips + local PR API stub)
```
