# agents

Custom agents as JSON/Markdown persona files for the dsh harness.

Author a persona file in the authoring root (default `<dshHome>/agents`), and
it becomes an agent preset the harness roster discovers live — selectable in
every preset picker without a restart. A materialized preset is the base
preset's composition (default `standard`) with the persona text swapped in, so
the agent keeps the base's capabilities and runs on the persona's
instructions.

## Authoring a persona

A Markdown persona (`foo.md`) carries display metadata in `---` frontmatter
and the system prompt as its body:

```markdown
---
name: PR Reviewer
description: Reviews pull requests
base: standard
---

You are a PR reviewer. Check for correctness, style, and test coverage.
```

A JSON persona (`foo.json`) is the same data with a `prompt` field:

```json
{ "name": "PR Reviewer", "description": "Reviews pull requests", "base": "standard",
  "prompt": "You are a PR reviewer. Check for correctness, style, and test coverage." }
```

The id is the file stem (sanitized), `name`/`description` feed the picker, and
`base` names a shipped preset whose composition is copied with the persona
spliced in (`{{model}}` and `{{cwd}}` resolve per agent, as in any persona
text). Unset `base` uses the settings `defaultBase`, then `standard`.

## Owner CLI

```
dsh agents list            personas and their materialized presets
dsh agents add <file>      copy a persona into the authoring root and sync
dsh agents remove <id>     delete a persona and its preset
dsh agents sync            materialize every persona, prune stale presets
```

The plugin also syncs at boot and whenever the authoring directory changes, so
dropping a file in `~/agents` is enough for it to appear.

## How it works

Materialization is filesystem-to-filesystem: `sync` writes each persona as a
preset directory under `<dshHome>/.agent-presets/` (the harness's user preset
root) — `agent.cordis.yml` (base composition with the persona row swapped, a
verbatim text splice so the `!!js` dialect round-trips untouched) and
`preset.yml` (picker metadata). A `.agents-source` marker names the
deriving file; sync prunes only marked presets whose source is gone, so a
hand-authored preset in the same root is never touched. When the shipped
preset tree is unreachable (`DSH_AGENTS_BASE_DIR` can point at it elsewhere),
materialization degrades to a bare persona row.

## Build

```sh
bun run build       # tsc -> lib/
bun run test        # node check-plugin.mjs (real standard-composition splice round-trips)
```
