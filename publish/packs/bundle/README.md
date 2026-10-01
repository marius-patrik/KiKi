# bundle

Harness-bootable `dsh.bundle` wrapper over the complete dsh-stack catalog.

## What this is

Every other pack under `publish/packs/` (`ai`, `core`, `ux`, `integrations`,
`agents`, `trading`, `vcs`) is a *composition* unit: a `package.json` whose
`dependencies` name the concrete plugin/extension packages for one domain.
None of them are directly bootable by DeepSeek Harness on their own -- the
harness only knows how to load a **bundle**: an npm package whose manifest
declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, listed by
name in a profile's `dsh.profile.bundles` array.

`@dsh-stack/pack-bundle` is that missing bridge. Its `cordis.patch.yml` is
generated (`node src/scripts/generate-stack-bundle-patch.mjs write`) from the
union of every plugin/extension package the seven domain packs above depend
on -- i.e. **the complete Stack**, not just one profile's closure -- so
adding this single package to a profile's `dsh.profile.bundles` mounts the
entire dsh-stack catalog with zero manual per-plugin wiring.

## Installing it into a harness profile

```jsonc
// $DSH_HOME/profiles/<name>/package.json
{
  "dependencies": {
    "@dsh-stack/pack-bundle": "^0.1.0"
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@dsh-stack/pack-bundle"]
    }
  }
}
```

`bun install` in the profile directory then resolves `@dsh-stack/pack-bundle`
and its full plugin/extension dependency closure into the profile's own
`node_modules`, where the bare package names in `cordis.patch.yml` resolve
through Node's ordinary parent-directory walk.

## Regenerating the patch

`cordis.patch.yml` is generated, not hand-written -- see the header comment
in the file itself. `bun run --filter @dsh-stack/pack-bundle verify` fails
loud if it drifts from what the domain packs currently compose (a plugin
added to `publish/packs/ux/package.json` without regenerating this file, for
example).
