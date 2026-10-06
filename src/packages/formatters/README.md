# formatters

DeepSeek Harness (`dsh`) plugin: per-extension formatter commands with a
model-facing `format` tool and optional auto-format-on-edit.

The harness web UI is read-only, so this plugin works through the seams the
agent uses to write: a `format` tool over per-extension formatter commands
(`prettier`, `black`, `gofmt`, ...) and, when enabled, automatic reformatting
after every successful `edit`/`write` via the `tools/post-execute` waterfall.
Formatters run through `ctx.subprocess` — never shell-interpreted.

## Settings

Since 0.2.0 a settings form is not registered: the settings service projects the
volatile Config fields of the active profile's entries, so this plugin's own
`Config` **is** its form and its namespace is its entry id `formatters`. The
plugin declares it ships its own page for that form.

Both fields are `.volatile()`, which is what makes the entry projectable at all —
`volatileForm` returns nothing when a Config declares no volatile field, so the
entry is silently dropped from `describe()` and every write to it is refused.
Both are the user's choice rather than a deployment fact: the table is
machine-local (which formatter exists and under what name differs per
workstation) and the toggle is a workflow preference.

```yaml
formatters:
  autoFormatOnEdit: true
  formatters:
    ".ts": { argv: [npx, prettier, --write] }
    ".py": { argv: [black, -q] }
```

Each field is a live reference: the Loader commits a settings write into the very
object `apply` received instead of remounting, so both the `format` tool and the
auto-format hook read them with `.get()` per call and pick up a settings edit
without a restart.

## CLI

```
dsh formatter list
dsh formatter add <ext> <command...>     e.g. dsh formatter add .ts npx prettier --write
dsh formatter remove <ext>
dsh formatter set-auto <on|off>
```

## Layout

- `src/settings.ts` — the `formatters` namespace (this plugin's entry id), the
  Config schema that is also its settings form, and the `formatterFor` /
  `autoFormatEnabled` helpers.
- `src/format.ts` — the shared formatting runner (`formatFile`) and path helpers.
- `src/index.ts` — plugin: settings page declaration, `format` tool, auto-format hook.
- `bin/formatter.mjs` — the `dsh formatter` CLI.
- `check-plugin.mjs` — boot-verify harness (`npm test`).
