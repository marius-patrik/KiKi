# agent-tools

Config-file custom tools for the dsh harness.

The plugin reads the `agent-tools` settings section — a map of tool name →
definition — and registers each definition as a model-facing `ctx.tools` entry
that runs its `command` through `ctx.subprocess` (never shell-interpreted),
with `{name}` argument placeholders substituted from the call. Custom tools are
indistinguishable from shipped ones to the model: same schema validation, same
output contract, same post-execute pipeline.

## Config-file format

The `agent-tools` section of `settings.yaml`:

```yaml
agent-tools:
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

Changes apply on the next boot.

## Build

```sh
bun run build       # tsc -> lib/
bun run test        # node check-plugin.mjs (real subprocess round-trips)
```
