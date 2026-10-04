# `@dsh-stack/bundle`

The complete dsh-stack as a **harness-native profile bundle**. A profile lists this
package in `dsh.profile.bundles` and the harness inserts every row from
[`cordis.patch.yml`](./cordis.patch.yml) as one patch layer over the empty profile
root.

This replaces the seven domain packs (`ai`, `core`, `ux`, `integrations`,
`agents`, `trading`, `vcs`) and the `@dsh-stack/pack-bundle` wrapper that
composed them. There is one bundle, its membership is the `dependencies` block of
[`package.json`](./package.json), and it uses the same
`dsh.bundle.patch` mechanism as the harness' own bundles — no separate pack
concept.

`cordis.patch.yml` is generated, so the bundle cannot drift from the tree:

```
node scripts/generate-stack-bundle-patch.mjs write   # regenerate
node scripts/generate-stack-bundle-patch.mjs check   # verify it is current
```

Rows are the plugins reachable from `dependencies` that mount as cordis entries.
Plugins that mount transitively through another row's dependencies are not listed
here, and plugins that cannot mount are listed in
`KNOWN_CORDIS_MOUNT_INCOMPATIBILITIES` with a reason.
