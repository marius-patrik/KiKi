# @dsh-stack/directory-picker-fix

Replaces harness's `directory-picker` row (`@deepseek-ai/dsh-host-directory-picker-auto`)
with a statically-mounted equivalent, working around a loader-entry
double-registration that only reproduces under a full Stack-scale boot
(dsh-stack#188).

## Why

The auto-chooser mounts its resolved backend (`native` or `browse`) as a
*dynamic* Loader entry from inside its own `apply()`. Under the full
`@dsh-stack/pack-bundle` composition (250+ concurrently-initializing
entries), that dynamic mount can race a second resolution of the same entry:
the `directoryPicker` cordis service ends up provided twice, and the whole
profile fails to boot with:

```
Error: service "directoryPicker" has been registered at <BrowseDirectoryPicker>
```

`harness/` is pinned and must not be modified directly. This package is
dsh-stack's own composition-level lever around the bug: its `apply()` mounts
the resolved backend as a plain, eager `ctx.plugin()` composition instead of
a dynamic Loader entry, reusing harness's own exported
`resolveDirectoryPickerBackend` so the native/browse choice stays exactly as
adaptive as before -- this does not hardcode one backend.

Disabling harness's own `directory-picker` row is what makes this take
effect, but that disable does not live in this package's own `cordis.patch.yml`
(it has none): only a profile's *top-level* `dsh.profile.bundles` layers have
their own patch read at boot, and no Stack profile lists this package there
directly -- it is only ever composed as a nested `insert` row inside
`@dsh-stack/pack-bundle`. The disable is instead emitted by
`src/scripts/generate-stack-bundle-patch.mjs` (`STATIC_DISABLE_ROWS`) into
`publish/packs/bundle/cordis.patch.yml`, the one file a Stack profile's
top-level bundle list actually applies.

## Usage

Composed automatically wherever `@dsh-stack/pack-bundle` is composed. No
configuration required.
