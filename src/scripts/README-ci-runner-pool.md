# CI runner pool

`ci-runner-pool.mjs` keeps CI capacity matched to the queue instead of to a
fixed number of installed agents.

## Why

Every job runs the same install/build/typecheck/verify/test pipeline, roughly
thirteen minutes. With a fixed pool, a queue of open pull requests serialises
against whatever runner count happens to be installed, and each merge
invalidates the remaining branches and re-queues them all. Two installed
runners against seven open pull requests is over an hour of waiting.

## How

The pool polls the repository for queued workflow runs and keeps one slot per
queued run, up to `CI_RUNNER_POOL_MAX`. Each slot loops:

1. Ask GitHub for a just-in-time runner configuration.
2. Run the agent with it.
3. The agent serves exactly one job and exits.

JIT registrations are ephemeral and single-use, so **every job is served by a
runner that has never seen another job**. No state leaks between builds, and a
crashed agent leaves no zombie registration to clean up.

Slots retire once the queue drains, so the machine is not carrying idle agents
between bursts.

## Running it

```bash
node src/scripts/ci-runner-pool.mjs
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `CI_RUNNER_POOL_REPO` | `marius-patrik/dsh-stack` | repository whose queue is served |
| `CI_RUNNER_POOL_MAX` | `8` | concurrent slot ceiling |
| `CI_RUNNER_POOL_TEMPLATE` | `~/actions-runner` | installed runner supplying the agent binaries |
| `CI_RUNNER_POOL_ROOT` | `~/.dsh-ci-runners` | where per-slot installations live |
| `CI_RUNNER_POOL_INTERVAL` | `15` | seconds between queue polls |

Requires an authenticated `gh` CLI with permission to create runner
registrations on the repository.

The first start of each slot copies the agent binaries out of the template
(about 190 MB, excluding the installer tarball and any registration state).
Subsequent starts reuse the slot directory.

Each slot gets its own `BUN_INSTALL_CACHE_DIR` and bun install cache.
Concurrent installs sharing one cache race and fail with `ENOTEMPTY`, which is
why the statically installed runners already key their store on the runner name.

## Running it on another machine

CI contends for the same cores as the harness, MLX inference, and interactive
work. On a single eight-core host running all of them, load average reached 250
and every CI job slowed down proportionally. CI is the part with somewhere else
to go.

On the machine taking over CI:

```bash
gh auth login                      # needs runner-registration permission
./src/scripts/setup-ci-runner-host.sh
```

It downloads the runner binaries for the platform, sizes the pool to the host's
core count, and starts the pool in the foreground. Nothing is registered
permanently: every runner is a single-use JIT registration, so stopping the
script leaves no runners behind and no cleanup to do.

The repository does not need to be checked out first -- each job checks itself
out. Only `gh`, `node` and network access are required.

To retire the original host's runners afterwards, stop their services
(`./svc.sh stop` in each `~/actions-runner*`); the queue simply drains to
whichever runners are online.

## Bound, not a target

`CI_RUNNER_POOL_MAX` exists to keep the pool from exhausting the host: each
slot is a full workspace install and TypeScript build. Raise it against
available cores and memory, not against queue depth.

## Relationship to the installed runners

The statically installed runners keep working alongside this. The pool adds
elastic capacity on top; it does not replace them, and nothing has to be
uninstalled for it to help.

Reproducible provisioning of this pool as node configuration rather than an
operator-run process belongs with the `dsh-hosts` CI node work (#114, #61).
