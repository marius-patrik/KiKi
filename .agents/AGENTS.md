# AGENTS.md

## Canonical rule files

Each standing rule below also exists as its own individually addressable file
under `.agents/rules/`, one file per rule. Reference a single rule by its file
(e.g. `.agents/rules/branch-and-merge-policy.md`) instead of quoting a slice of
this document. This file still carries the full text of every rule; the split
into `.agents/rules/` is the canonical per-rule addressing layer, and whether
this document later becomes a generated index over those files is a separate,
still-open decision (#60).

## Repository mission

`dsh-stack` is a distributable extension stack for DeepSeek Harness. The upstream `harness/` submodule is pinned and pristine. Stack owns the complete implementation catalog in `plugins/`.

## Canonical structure

- `plugins/` is the canonical implementation layer, and the only one. Every folder under it is one plugin: one concrete implementation, owning its own source. Plugins may import from other plugins; there is no restriction against plugins depending on one another.
- `bundles/` holds profile compositions as harness-native bundles: a package with `dsh.bundle.patch` and a `cordis.patch.yml`, which is exactly the mechanism the harness' own bundles use. `bundles/web` is the complete Stack; `bundles/headless` is that composition filtered to plugins that mount without a web server. A bundle's membership is the `dependencies` block of its own manifest, and its `cordis.patch.yml` is generated from it, so the two cannot drift.
- `scripts/` is verification and release tooling, plus the `dsh` launcher/service-manager script and its aliases.
- `.agents/notes/` is the canonical documentation root.
- `README.md`, `AGENTS.md`, and `CLAUDE.md` at repository root are all symlinks to `.agents/AGENTS.md`.
- `harness/` is upstream and must not be modified.
- No duplicate implementation tree, compatibility bridge, migration shim, legacy runtime path, or parallel feature owner is allowed.

There is no second tree of wrappers. An earlier layout kept implementations in `src/packages/` and `publish/extensions/` and put 74 re-export shims in `publish/plugins/`, each resolving a canonical package elsewhere; the seven domain packs and the `@dsh-stack/pack-bundle` wrapper composed them. A folder that only re-exports another plugin is an indirection with no owner, and `verify-stack.mjs` fails it.

## Plugin and bundle model

Two roles, not three:

- **Plugin** = one folder under `plugins/`, and one concrete implementation. There is no separate "extension" role: a skin, an icon set, an agent preset, a per-language LSP server, a provider adapter, and an abstraction/registry are all plugins. What used to be an "extension of an abstraction" is simply the plugin that implements it.
- **Bundle** = a composition of plugins for a profile, expressed natively as `dsh.bundle.patch` + `cordis.patch.yml`. There is no per-domain pack: grouping by domain was a second composition axis that had to be kept in sync with the first, and a profile that wanted one provider had to depend on a pack that existed only to name it.

When a plugin's `apply()` registers several distinct, independently-meaningable capabilities (multiple unrelated settings sections, multiple unrelated command families, multiple unrelated bundled features), that is a bundling smell: split them into separate plugins, each owning its own implementation.

## Plugin and bundle contract

Every canonical package follows the common package contract: unique `@dsh-stack/<id>` name, independent semantic version, ESM, explicit exports, publishable files only, appropriate `stack.kind`, globally unique namespaced `stack.id`, explicit required/optional dependencies, and build/typecheck/test/verify scripts. No checked-in generated implementation output is permitted.

A bundle is a composition/distribution unit over plugins. It carries no implementation of its own: a bundle that shipped code would be a second owner for it. `stack.kind` is one of `plugin`, `bundle`, or `library`; there is no `pack` and no `extension` kind.

## No duplicate or legacy implementations

There is exactly one implementation owner for every feature. Before adding code, locate the existing owner and extend/refactor it. Do not retain old APIs, icon registries, fallback implementations, compatibility bridges, or migration shims merely to preserve an old architecture. Claude and Codex skin-owned UI remain explicit skin ownership exceptions where specified by the product architecture.

## Profiles

The Stack profiles compose packages and plugins rather than embedding feature implementations.

| Profile | Purpose |
| --- | --- |
| `@dsh-stack/profile-default` | general Stack experience |
| `@dsh-stack/profile-coding` | coding, repositories, tools, editor/LSP and absorbed DarkFactory capabilities |
| `@dsh-stack/profile-trading` | research, backtesting, optimization and absorbed MoneyMaker capabilities |
| `@dsh-stack/profile-skyblock` | SkyBlock capabilities absorbed from SkyAgent |

## UI

The Stack shell uses DSH-native slots. The sidebar provides Files, file-row actions, profile selection, configurable New Conversation/logo visibility, skins, coherent collapsed/expanded behavior, and unified workspace/tab concepts. VS Code icons are an independent extension. DeepSeek, Claude and Codex skins are independent extensions.

## Credentials and agents

Credentials support typed secrets such as API keys, passwords, TOTP/QR provisioning, OAuth, passkeys, recovery codes, SSH keys, certificates and generic notes. Agents use DSH's native preset primitive; personas are durable session state independent from session actions.

## Development

```bash
bun install
bun run typecheck
bun run build
bun run verify
bun run test
```

## Web UI boundary

The intended separate web UI base is `zhu1090093659/dsh-web-ui`, default branch `dev`. Its tab implementation is the reference/base for the Stack web UI. `zhu1090093659/DSH-better-sidebar` is a separate sidebar reference. Do not copy either project into `dsh-stack` as a second implementation.

## CI node architecture

CI automation is intended to run on a real DSH node managed through `dsh-hosts`, not on a bare GitHub runner installation. The node must boot the complete Stack, synchronize repository/node state through `dsh-hosts`, select the `headless` profile, and expose the GitHub Actions runner as one node capability. Credentials remain outside the repository.

## Documentation

`.agents/notes/PRD.md` is the canonical product requirements document. Keep current architectural decisions in `.agents/notes/` and do not create a second documentation root.

New architecture-decision docs and PRD sections for a capability must land in the same pull request as the code that introduces that capability. Documentation describes what shipped, not what is planned.

## Branch and merge policy

- `main` is the only release branch.
- Every feature branch merges through a pull request into `main`.
- Pull requests must have green Canonical Stack workspace, Format repository, and Merge enforcement checks.
- Pull requests must contain the current `main` tip before merge.
- Merged same-repository branches are automatically cleaned up.
- Before a pull request merges, everything it touched must be scoped in attached issue(s): deferred work, follow-ups, or scope discovered mid-PR that isn't fully resolved in the PR gets its own linked GitHub issue, not an implicit or undocumented gap.
- A pull request's description must precisely describe everything the PR actually did — an accurate, complete account of the changes, not a vague or partial summary.

## Repository hygiene

Repository state is self-consistent, and a scheduled sweep enforces it rather than trusting that every event fired. A non-`main` remote branch is either backed by an open pull request or deleted; pushing a branch as a backup, with no pull request, is not a supported state. Every open issue and pull request is on board 13, carries an `area:*` and a `severity:*` label, and has a Status. Board Status is a projection of repository state, reconciled in both directions including terminal states — merged or closed means `Done`.

Because reconciliation rederives every Status from scratch, a Status that nothing in the repository backs cannot survive a sweep. To mark something blocked, record the block (`blocked` label or a `blocked_by` dependency); to park something as an idea, label it `type:idea`, which also exempts it from the label requirement, since an idea is untriaged by definition; to mark something in progress, assign it; triage — both required labels — is what promotes `Backlog` to `Ready`.

The sweep deletes only branches with zero commits ahead of `main`, where nothing can be lost. A branch ahead of `main` with no pull request gets a draft pull request, never a deletion, because an unproposed branch is a review problem rather than a cleanup problem.

Event-driven hooks cannot do this alone, and the reason is structural: GitHub runs `pull_request` workflows against `refs/pull/N/merge`, so a conflicting pull request emits no events at all; a workflow added today never sees the backlog predating it; and a failed run drops its events with nothing to replay them. Event triggers exist for latency, the schedule for completeness. Full text: `.agents/rules/repository-hygiene.md`.

## File and naming granularity

- Avoid monolith files: a source file should generally implement one function (one cohesive unit of behavior), not a grab-bag of unrelated helpers.
- Avoid generic file/module names like `utils`, `helpers`, or `misc`. A name must capture the specific nuance of what the file does, not a catch-all category.

## Release model

The Stack version increments on every merge to `main`. Releases contain the complete plugin and pack catalog, with exact versions, dependencies, integrity data, and distributable artifacts for every included package.

## Issue, roadmap, and dispatch policy

- Merged same-repository branches must actually auto-delete: the repository's `delete_branch_on_merge` setting must stay enabled, not just documented as a policy.
- Large or multi-part work is tracked as an `epic`-labeled master issue with a checklist of child issue links, not as one giant issue or one giant PR. Each child issue gets its own worktree and PR.
- Every open issue and PR is kept on the repository's project board: **`dsh-stack`, project number 13, owner `marius-patrik`** (`gh project item-add 13 --owner marius-patrik --url <issue-or-pr-url>`) — this is the only project actually linked to this repository (verify via `gh api graphql -f query='{ repository(owner:"marius-patrik", name:"dsh-stack") { projectsV2(first:20) { nodes { number title } } } }'` if in doubt, rather than trusting a remembered number). Each item's `Status` field is kept current with its real state. Every item also carries an `area:*` label and a `severity:*` label (`critical`/`high`/`low` etc.) so priority is visible without re-deriving it from scratch each session.
- Work with a real dependency chain between packages (e.g. a foundation package other packages build on) uses stacked PRs: land the foundation PR first, then branch dependents from post-merge `main`, not from each other's unmerged branches.
- A UI bug fix or UI-facing feature is not done until verified live in a real browser against a genuinely booted harness — passing typecheck/build/verify/test is necessary but not sufficient proof a UI feature actually works.
- When you stumble on anything out of scope — a defect, dead or duplicated code, a missing capability, an unenforced rule — file it as an issue (or comment on the existing one) before moving on. A finding recorded only in a session transcript is lost when that session ends.
- When independent, well-scoped execution work can run unattended (a single child issue, a single sub-scope with clear acceptance criteria), prefer dispatching it to a separate execution agent (a background subagent, or the Kimi CLI where available) running in its own worktree, rather than doing it serially in the primary session — this parallelizes throughput and conserves the primary session's own usage budget.
- Before dispatching, decompose the issue into small chunks — narrow, sequential, low-ambiguity steps (e.g. "create the section shell", "move content A in", "move content B in", "retire the old registrations") — not one open-ended "implement this issue" prompt. A chunk that still requires real judgment calls, unresolved architecture questions, or live debugging of an inconsistent repro is not junior-dispatchable as scoped; either scope it down further first, or route it to more capable execution (Kimi, or the primary session itself) instead of a junior/headless run.
- Spread dispatched work across every configured, healthy provider account, not the same one or two repeatedly. `Settings → Accounts` under-represents what's actually configured (see #247) — the authoritative list is `providers.custom` in `.data/settings.yaml` (`grep 'apiKeyEnv' .data/settings.yaml` for a quick census), which `dsh --profile headless` reads directly. At last count that included multiple accounts each for OpenRouter, Mistral, Groq, Gemini, Cerebras, SambaNova, and Z.ai, plus Ollama/local — treat that file, not the Settings UI, as ground truth when picking dispatch targets. The chunk decomposition above and this spread work together: many small independent chunks on many different accounts route around any single provider or account's rate/usage limit, so a limit hit stalls only its own chunk rather than the batch. Within one dispatched run, `dsh`'s own same-vendor account rotation already recovers from a mid-task quota/rate-limit error onto a sibling account without losing progress (see the quota-consolidation work, #164) — this bullet is about the *initial* spread across a batch of dispatches, not manually babysitting an individual run.

## Duplication exemptions

The duplicate gate runs at a zero threshold, so `jscpd:ignore-start` is the only way past it. Every exemption states why the repetition is structural, and every one is closed; `bun run verify` enforces both. Exempt the smallest region that needs it, never a whole file — an unclosed marker silences the rest of the file rather than the block it was written for. If the honest reason is "this should be extracted", extract it.

## Unified surface components

Every surface presenting the same concept uses the same components; only the topmost level — placement, sizing, docking, collapsibility — differs. A tab is a tab whether it sits in the main area, the bottom panel, or the secondary sidebar, so the tab strip, context menu, tab model, move semantics and empty state are written once and parameterised by placement. A capability that works in one surface and not another is a defect, not a scoping decision.

## Reachability

Every package must be reachable by the running system: mounted in the generated bundle patch, shipping a browser half through `dsh.client`, imported by another package's source, or exposed as a CLI. An extension additionally qualifies by being composed into a pack. `bun run verify` enforces this. Before implementing, confirm the code you are about to change actually runs.

## Destructive actions

Destroying running work or user state is always a deliberate, separately-presented action, never the cheapest gesture. Closing a terminal or container tab detaches; killing it is its own action. A transfer commits only once a destination has taken ownership. Every destructive server route logs what ran, against what target, and which caller asked.

## No silent no-ops

An action that cannot proceed says so rather than returning as though it succeeded. `x ? doThing() : Promise.resolve()` in a mutating path converts a missing dependency into a lie about the outcome; surface the failure, or disable the control.

## Verification standard

Completion requires workspace typecheck, workspace build, package-contract verification, duplicate-source verification, placeholder/unchecked-cast/unfinished-code verification, package tests, release packaging/manifest generation, and real user-visible UI wiring. Never weaken a verifier to make CI green; fix the implementation or repository structure.
