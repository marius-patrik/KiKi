# lsp

DeepSeek Harness (`dsh`) plugin: owns the LSP capability on the web profile.

The harness ships the LSP service definition (`ctx.lsp`), a generic stdio
provider (`dsh-lsp-stdio`), and a model-facing `lsp` tool (`dsh-tool-lsp`), but
composes none of them by default. This plugin mounts the trio and feeds the
stdio provider the server table from the `lsp` settings section, so the
agent's `goToDefinition` / `findReferences` / `goToImplementation` / `hover`
queries work out of the box.

## Settings

`lsp:` section of `settings.yaml`:

```yaml
lsp:
  servers:
    typescript:
      command: typescript-language-server
      extensionToLanguage: { ".ts": typescript, ".tsx": typescriptreact }
      args: [--stdio]
```

Server entries follow `LspLocalServerConfig` from `@deepseek-ai/dsh-lsp-stdio`.
Changes apply on the next boot (mounts are boot-time, not hot-reloaded).

## CLI

```
dsh lsp list
dsh lsp servers add <id> <command> [--ext=.ts=typescript] [--args=a b c]
dsh lsp servers remove <id>
```

## Layout

- `src/settings.ts` — the `lsp` settings namespace and server entry schema.
- `src/index.ts` — plugin: settings section + mounting the LSP trio.
- `bin/lsp.mjs` — the `dsh lsp` CLI.
- `check-plugin.mjs` — boot-verify harness (`npm test`).
