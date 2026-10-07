---
date: 2026-08-27
status: active
---

# Repository mission and canonical structure

## Repository mission

`KiKi` is the umbrella repository for the DeepSeek Harness-based stack and its adjacent agent infrastructure. The upstream `DSH/` submodule is pinned and pristine. Stack owns the complete implementation catalog in `plugins/`.

## Canonical structure

- `plugins/` is the canonical implementation layer, and the only one. Every folder under it is one plugin: one concrete implementation, owning its own source. Plugins may import from other plugins; there is no restriction against plugins depending on one another.
- `bundles/` holds profile compositions as harness-native bundles: a package with `dsh.bundle.patch` and a `cordis.patch.yml`, which is exactly the mechanism the harness' own bundles use. `bundles/web` is the complete Stack; `bundles/headless` is that composition filtered to plugins that mount without a web server. A bundle's membership is the `dependencies` block of its own manifest, and its `cordis.patch.yml` is generated from it, so the two cannot drift.
- `scripts/` is verification and release tooling, plus the `dsh` launcher/service-manager script and its aliases.
- `.agents/notes/` is the canonical documentation root.
- `README.md`, `AGENTS.md`, and `CLAUDE.md` at repository root are all symlinks to `.agents/AGENTS.md`.
- `DSH/` is upstream and must not be modified.
- No duplicate implementation tree, compatibility bridge, migration shim, legacy runtime path, or parallel feature owner is allowed.

There is no second tree of wrappers. An earlier layout kept implementations in `src/packages/` and `publish/extensions/` and put 74 re-export shims in `publish/plugins/`, each resolving a canonical package elsewhere; the seven domain packs and the `@dsh-stack/pack-bundle` wrapper composed them. A folder that only re-exports another plugin is an indirection with no owner, and `verify-stack.mjs` fails it.

## Plugin and bundle model

Two roles, not three:

- **Plugin** = one folder under `plugins/`, and one concrete implementation. There is no separate "extension" role: a skin, an icon set, an agent preset, a per-language LSP server, a provider adapter, and an abstraction/registry are all plugins. What used to be an "extension of an abstraction" is simply the plugin that implements it.
- **Bundle** = a composition of plugins for a profile, expressed natively as `dsh.bundle.patch` + `cordis.patch.yml`. There is no per-domain pack: grouping by domain was a second composition axis that had to be kept in sync with the first, and a profile that wanted one provider had to depend on a pack that existed only to name it.

When a plugin's `apply()` registers several distinct, independently-meaningable capabilities (multiple unrelated settings sections, multiple unrelated command families, multiple unrelated bundled features), that is a bundling smell: split them into separate plugins, each owning its own implementation.

