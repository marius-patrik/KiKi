# agent-tools

Custom tools for the dsh harness.

The plugin registers each tool in the `agent-tools` entry's own `tools` map — a
map of tool name → definition — as a model-facing `ctx.tools` entry that runs its
`command` through `ctx.subprocess` (never shell-interpreted), with `{name}`
argument placeholders substituted from the call. Custom tools are
indistinguishable from shipped ones to the model: same schema validation, same
output contract, same post-execute pipeline.

## Config format

Which tools exist is the user's choice, not a deployment fact, so the whole map
is the entry's one volatile Config field: the settings service projects it as
this entry's form, and the Loader commits each write into the same reference
without restarting the plugin. A tool added, edited, or removed through the form
is callable from the running session.

```yaml
- id: agent-tools
  name: '@dsh-stack/agent-tools'
  config:
    tools:
      echo-name:
        description: Echo the name argument
        parameters:
          name: { type: string, required: true }
        command: [node, -e, 'process.stdout.write(process.argv[1])', '{name}']
```

- `description` — what the model sees this tool doing.
- `parameters` (optional) — argument schema; each entry is `{ type:
  string|number|boolean, description?, required? }`.
- `command` — argv[0] is the executable (absolute or on PATH); `{name}`
  placeholders substitute the matching argument value.

## Owner CLI

```
dsh tool list
dsh tool add <name> <description> <command...>
dsh tool remove <name>
```

The CLI still edits the `agent-tools` section of `$DSH_HOME/settings.yaml`, which
0.2.0 imports into the active profile once at boot; a tool added through it is
therefore callable from the next boot, not the running session.

## Build

```sh
bun run build       # tsc -> lib/
bun run test        # node check-plugin.mjs (real subprocess round-trips)
```
