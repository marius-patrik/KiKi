# `@dsh-stack/bundle-headless`

The dsh-stack as a **harness-native headless profile bundle**: the same
composition as [`@dsh-stack/bundle`](../web), filtered to plugins that mount
without a web server.

Generated the same way:

```
node scripts/generate-stack-bundle-headless-patch.mjs write
node scripts/generate-stack-bundle-headless-patch.mjs check
```

The filter is derived, not hand-maintained: a plugin is excluded when it injects a
web-only service (`webServer`, `loader`), and the reason is printed on every write.
