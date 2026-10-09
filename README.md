# KiKi

KiKi is the umbrella repository for the DSH-based agent platform and its adjacent infrastructure.

## Repository layout

- `DSH/` — pinned upstream DeepSeek Harness.
- `plugins/` — KiKi-native plugins, grouped by logical domain folders. The folders are organizational bundles only; they are not runtime profile compositions.
- `plugins/Memory/` — staged external Memory plugin source until it is migrated into KiKi.
- `_migrate/` — temporary source repositories retained only for migration work. Nothing under this directory is part of KiKi's runtime architecture.

Profiles are ordinary DSH profiles. KiKi does not maintain a second profile-composition system or generated runtime bundle layer.

## Development

```sh
bun install
bun run build
bun run typecheck
bun run verify
bun run test
```

Repository rules and contributor guidance live in `AGENTS.md`.
