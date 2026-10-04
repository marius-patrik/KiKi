# Stack PRD

## Product

DSH Stack is a polished, distributable extension system for DeepSeek Harness. DSH remains the runtime and composition authority; Stack supplies independently versioned plugins, composable packs, reusable support libraries, profiles, integrations, and the release/update system around them.

## Architecture

The canonical source tree is `src/packages/`, composed by `publish/plugins/`, `publish/extensions/`, and `publish/packs/`. Every feature has one owner. Libraries implement reusable mechanics; plugins/extensions expose user-visible behavior or external integrations; packs compose plugins/extensions and never impersonate runtime services. The harness submodule is pinned and pristine.

Plugin composition supports required dependencies, optional dependencies, bundled dependencies, and plugin packs. External services are isolated into their own plugins. Profiles are compositions, not alternate implementations.

## Profiles

- **Default** — general DSH experience.
- **Coding** — development environment, repository workbench, editor/LSP/formatting/tooling, and absorbed DarkFactory functionality.
- **Trading** — market data/research, deterministic indicators, backtests, optimization, provider seams, and absorbed MoneyMaker functionality.
- **SkyBlock** — absorbed SkyAgent functionality and SkyBlock-specific tooling.

## UI shell

The Stack UI uses DSH's native slot/composition seams and does not mutate the DOM. The sidebar is a canonical implementation with action buttons above Files, profile selection above Settings, configurable New Conversation visibility, configurable brand-logo visibility, file/folder rows, three-dot context menus, muted host/container sections, and a coherent collapsed/expanded layout.

The Files view uses DSH filesystem capabilities. Tabs, panes, terminals, conversations, containers, and workspaces share one tab model. File icons are resolved through an icon service; VS Code icon support is its own plugin.

Settings contains a Profiles area, sidebar preferences, credentials, agents/personas, quotas, providers/models, and other feature-owned sections. Settings remains compact and feature-owned sections do not duplicate shell state.

Everything that changes how the Stack looks lives under one Appearance section rather than as sibling entries in the settings nav: the theme studio, skins, icons, and themes are pages inside it. Appearance owns no controls of its own — each page stays implemented by the package that owns it and registers into the section's `settings.appearance.tab` seat, so adding an appearance page never means editing the section.

Quota status has no standalone page: the Accounts and Models settings sections embed live quota meter bars, status lights, and reset timers directly against the provider/account cards they describe, including a per-account breakdown for multi-account vendors (OpenRouter, Groq, Cerebras, and any other numbered custom provider a user configures). The `QuotaRegistry`/`QuotaSnapshot` probing engine and its `/quotas/api/*` endpoints remain the one data source both the built-in provider cards and the custom-vendor breakdown read from.

## Skins and branding

DeepSeek, Claude, and Codex skins are separate plugins. Each owns its branding assets and plugs into the single Stack skin host. The sidebar is brand-agnostic. The DeepSeek logo can be hidden independently in collapsed and expanded sidebar states.

## Agents

Agents use DSH's native agent-preset primitive. Stack supplies actual preset resources and composition, never a synthetic agent manager. Personas are durable session state, independent of session modes, and can be switched during a conversation. Agent/preset UI and commands operate through DSH's native seams.

## Credentials

The credential stack supports API keys, passwords, TOTP seeds and QR provisioning, OAuth grants, passkeys/WebAuthn metadata, recovery codes, SSH keys, certificates, cookie jars, and generic secrets. Secret material is kept behind the credential seam; provider configuration stores references rather than raw secrets. The vault uses authenticated encryption and explicit secret typing.

## Coding

Coding owns repository interaction, editor/LSP/formatting/tooling integrations, code-server and automation features absorbed from DarkFactory, with GitHub/GitHub Projects and Trello exposed as independent integration plugins.

## Trading

Trading owns provider-neutral market data, deterministic research indicators, backtests, optimization and verification. The research/backtest/optimizer chain is deterministic and does not fabricate unsupported metrics.

## SkyBlock

SkyBlock is the profile/domain destination for SkyAgent functionality, keeping the domain logic independent of the coding and trading profiles.

## Integrations

Every external service is its own plugin. At minimum the stack supports GitHub, GitHub Projects, Trello, Git/GitLab/Forgejo, provider adapters, container/host integrations, LSP servers, terminal integrations, and other absorbed useful capabilities.

## Packaging and distribution

Every plugin, extension, and pack is its own publishable package under `publish/**`, with the same package contract and its own semver. The Stack root package is a release coordinator rather than a substitute for plugin packages.

Every merge to `main` increments the Stack version. Only modified plugins/packs receive version bumps, based on the semantic change within that package. The release pipeline builds every package, publishes every newly versioned package, generates a complete package catalog with exact versions, dependencies and integrity data, uploads package artifacts and the full manifest to the GitHub release, and updates the updater catalog.

The Stack release always contains the complete plugin/pack catalog. Packs reference exact component versions. The updater plugin compares installed versions against the remote catalog and performs dependency-aware updates.

## Quality bar

No duplicate implementations, compatibility bridges, migration shims, legacy detectors, placeholder services, checked-in generated output, unchecked unsafe casts, or unfinished markers. CI is the executable quality gate. UI work is considered complete only when it is connected to actual DSH seams and behaves coherently in the real client.


## Durable agent identity and environments

The Stack provides a persistent agent kernel independent of conversations, presets and model
providers.

The kernel persists one stable agent identity and an append-only multi-source event worldline under
the effective DSH home. Environment integrations can register ordered event sources plus capabilities,
and restart/replay must not duplicate semantic source events.

The kernel is environment-neutral: DSH remains usable with no Omnis installation, and no environment
integration becomes the identity of the agent. Further persistent-agent capabilities are tracked by
epic #300 and are documented here only when their implementations land.
