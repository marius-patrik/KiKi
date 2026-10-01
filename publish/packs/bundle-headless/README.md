# bundle-headless

Harness-bootable `dsh.bundle` wrapper over the headless-safe subset of the
dsh-stack catalog.

## What this is

`dsh --profile headless` composes zero `@dsh-stack/*` packages by default:
its `dsh.profile.bundles` (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`)
is pure harness, with no Stack layer at all -- so any Stack-authored
capability, `@dsh-stack/provider-rotation`'s account-rotation adapter above
all, is unreachable from headless dispatch out of the box (dsh-stack#213).

`@dsh-stack/pack-bundle` (the full Stack bundle) can't just be pointed at
headless as-is: several of its packages `inject: ["webServer", ...]` or
`inject: [..., "loader"]` -- harness services a headless boot, a one-shot CLI
dispatch with no HTTP server or dynamic Loader tree, never composes. Mounting
one of those under headless doesn't crash the boot; the entry just sits at
`pending (waiting for service: ...)` forever.

`@dsh-stack/pack-bundle-headless` is the same bridge `@dsh-stack/pack-bundle`
is for the `web` profile, scoped to the packages that are actually safe to
compose without a web server. Its `cordis.patch.yml` is generated
(`node src/scripts/generate-stack-bundle-headless-patch.mjs write`) from
`@dsh-stack/pack-bundle`'s own generated package list, filtered to the
packages whose built `inject` array names neither `webServer` nor `loader` --
a correctness filter on the built loader shape, not a hand-picked "useful for
headless" list, so a newly added Stack package is included or excluded
correctly without this generator needing to know about it by name. That
filter is safety-only: some included packages (UI-only extensions with no
real host effect beyond an inert `apply()`) are harmless but not
particularly *useful* under headless either -- matching `@dsh-stack/pack-bundle`'s
own "the complete Stack, not just one profile's closure" philosophy rather
than trying to hand-curate a minimal headless set.

## Installing it into a headless profile

<!-- jscpd:ignore-start -- not a real duplicate: jscpd matches this one JSON
     block against a one-line-shifted copy of itself (a tokenizer artifact on
     its own nested-bracket structure), not against any other file's content. -->
```jsonc
// $DSH_HOME/profiles/headless/package.json
{
  "dependencies": {
    "@dsh-stack/pack-bundle-headless": "^0.1.0"
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "@dsh-stack/pack-bundle-headless"]
    }
  }
}
```
<!-- jscpd:ignore-end -->

`bun install` in the profile directory then resolves
`@dsh-stack/pack-bundle-headless` and its full dependency closure into the
profile's own `node_modules`. This step is currently manual -- there is no
automatic "ensure a profile's `node_modules` has what its `dsh.profile.bundles`
needs" mechanism in dsh-stack's own launcher yet (tracked separately, #169);
until that lands, adding this package to a fresh headless profile needs the
same manual `bun install`/symlink step `@dsh-stack/pack-bundle` already
needs for a fresh `web` profile.

## Regenerating the patch

`cordis.patch.yml` is generated, not hand-written -- see the header comment
in the file itself. Regenerate `@dsh-stack/pack-bundle`'s own patch first
(this generator reads its package list, not a second independent domain-pack
scan), then this one. `bun run --filter @dsh-stack/pack-bundle-headless run
verify` fails loud if it drifts.
