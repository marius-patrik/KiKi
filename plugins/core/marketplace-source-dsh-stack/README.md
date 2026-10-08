# marketplace-source-dsh-stack

The first `marketplace` source: lists this repo's own release catalog as
installable entries.

Source of truth: the GitHub Releases API for `marius-patrik/dsh-stack`. On
`listEntries()`, this extension fetches the repo's latest release, reads its
`stack-release.json` manifest asset (the same manifest
`src/scripts/release.mjs manifest` produces for auto-update consumption), and
maps its package catalog to `MarketplaceEntry` records pointing their install
source at that release's page.

The `fetch` used for both requests is injectable (`config.fetchImpl`), which
is how `verify.mjs` exercises the real fetch/parse/map pipeline against a
canned response instead of requiring live network access in a sandboxed
environment — the mapping logic under test is real, only the transport is
substituted.
