# @dsh-stack/launcher

The `dsh` command: homeRoot/command-aware launcher and service manager for the
DeepSeek Harness web server. This package replaces the historical
`src/scripts/dsh` bash script with a canonical, tested TypeScript implementation.

## Usage

```
dsh start        Start the dsh web server in the background
dsh stop         Stop the running dsh web server
dsh restart      Gracefully restart the dsh web server and show health
dsh status       Show process status, URLs (Local + Tailscale), and plugin health
dsh logs [-f]    View or tail the web server logs (-n <lines> to change tail size)
dsh attach       Live attached view: streamed log plus a refreshing plugin-metrics
                 line (-n <lines> backlog, -i <seconds> poll interval)
dsh accounts|theme|lsp|formatter|agents [args]   Route to the owning package CLI
dsh [args...]    Fall through to the harness CLI
```

`dsh-restart` (invoked under that name with no arguments) is an alias for
`dsh restart`.

## Behavior

- **homeRoot migration**: reads the `dsh-tweaks` section of
  `$DSH_HOME/settings.yaml` (default `~/.agents`). When `dsh-tweaks.homeRoot`
  points elsewhere, state (`profiles/`, `sessions/`, `vault/`, `settings.yaml`,
  `.credentials.yaml`, `accounts.vault`, `accounts.key`) is copied
  non-destructively to the new root — existing destination entries are never
  overwritten — and the new root becomes the effective `DSH_HOME`.
- **Default command**: with no arguments, `dsh-tweaks.command` (when set) is
  word-split into argv, matching the bash launcher's behavior.
- **Port detection**: the launcher never assumes a fixed port. Before start it
  reads the `webserver` entry of the active profile's `cordis.patch.yml`
  (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`, profile from `DSH_PROFILE`,
  default `web`) as the port hint; after start it parses the server's own
  startup log line (`dsh web: http://<host>:<port>`) to learn the actually
  bound port. `status`/`stop` resolve the port from the profile patch first,
  then the last bound port in the log, then the 3080 default.
- **Attach**: `dsh attach` resolves the port exactly like `status`/`stop`
  (profile patch, then last bound port in the log, then the default — never a
  hardcoded port), refuses to attach when nothing is listening there, prints
  the log backlog and then streams appended log content, and every `-i`
  seconds (5 by default) polls the running server's
  `pluginInventory/list` RPC and prints a metrics line with total/active/failed
  plugin counts. A server that stops answering the RPC is reported in that
  line rather than ending the session. Ctrl-C detaches: the log watcher and
  the poll timer are torn down and `dsh` exits 0, leaving the server running.
- **Harness discovery**: `DSH_HARNESS` env var, else the `harness/` submodule
  of the enclosing dsh-stack checkout (`../../../harness` relative to this
  package). Server logs go to `<os-tmpdir>/dsh-web.log`.

## Platform notes

Process discovery (`findListenerPid`) uses `lsof`, available on macOS and
Linux. On Windows the lifecycle verbs report that process discovery is
unsupported; full Windows support (netstat/powerShell-based discovery) is
follow-up scope of the installer work tracked in issue #45. Everything else —
settings parsing, homeRoot migration, log reading/following, port resolution —
is pure Node and platform-neutral.
