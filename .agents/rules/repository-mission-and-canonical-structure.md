---
date: 2026-10-07
status: active
---

# Repository mission and canonical structure

## Repository mission

KiKi is the umbrella repository for the DSH-based agent platform and adjacent infrastructure. The upstream DSH submodule is pinned and pristine.

## Canonical structure

- `plugins/<group>/<plugin>/` is the single native implementation tree.
- `plugins/{agents,ai,core,integrations,trading,ux,vcs}/` are logical bundles: organizational folders only. They are not packages, runtime bundles, or profile compositions.
- `plugins/Memory/` is staged external source until it is migrated into the native tree.
- `_migrate/` contains temporary source repositories retained only for migration work. Nothing there is runtime architecture.
- Profiles are ordinary DSH profiles. KiKi mounts its plugins directly through each profile's normal patch layer and does not inject an aggregate `@dsh-stack/bundle*` package.
- `scripts/` contains verification, release, and bootstrap tooling.
- `.agents/notes/` is the canonical documentation root.
- `README.md` is a standalone repository overview.
- Root `AGENTS.md` points to `.agents/AGENTS.md`; `CONTRIBUTING.md` points to `AGENTS.md`; there is no root `CLAUDE.md`.
- `DSH/` is upstream and must not be modified.

No duplicate implementation tree, compatibility bridge, migration shim, legacy runtime path, or parallel feature owner is allowed.

## Plugin grouping model

A plugin is one concrete package under `plugins/<group>/<plugin>/`. The first-level group is a human/navigation boundary only; moving a plugin between groups does not change its package identity or runtime behavior.

Runtime profile membership is independent of those folders. Profile composition belongs to DSH profile configuration, not to logical grouping folders.
