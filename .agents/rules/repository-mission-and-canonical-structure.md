---
date: 2026-08-27
status: active
---

# Repository mission and canonical structure

## Repository mission

`dsh-stack` is a distributable extension stack for DeepSeek Harness. The upstream `harness/` submodule is pinned and pristine. Stack owns the complete implementation catalog in `src/packages/` and the composed plugin tree in `publish/plugins/`.

## Canonical structure

- `src/packages/` is the canonical flat implementation layer. Every concrete implementation exists exactly once here. Packages may import from other packages; there is no restriction against packages depending on one another.
- `src/scripts/` is verification and release tooling, plus the `dsh` launcher/service-manager script and its aliases.
- `publish/plugins/` is the full composition/catalog tree. It imports canonical implementations from `src/packages/` and does not duplicate implementation source.
- `publish/packs/` is a folder under `publish/`, sibling to `publish/plugins/`/`publish/extensions/`, holding pack aliases/compositions only; it is not a workspace member on its own right (packs are, however, real workspace packages under `publish/packs/*`).
- `publish/extensions/` is a folder under `publish/`, sibling to `publish/plugins/`/`publish/packs/`, holding extension implementations (see the plugin/extension/pack model below).
- `.agents/notes/` is the canonical documentation root.
- `README.md`, `AGENTS.md`, and `CLAUDE.md` at repository root are all symlinks to `.agents/AGENTS.md`.
- `harness/` is upstream and must not be modified.
- No duplicate implementation tree, compatibility bridge, migration shim, legacy runtime path, or parallel feature owner is allowed.
- A plugin, extension, or pack does not have to correspond 1:1 with a canonical package; the composition tree and the implementation layer are independent axes.
