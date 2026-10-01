---
date: 2026-08-27
status: active
---

# Every package must be reachable

A package in this repository must be reachable by the running system: mounted in
the generated bundle patch, shipping a browser half through `dsh.client`,
imported by another package's source, or exposed as a CLI through `bin`. An
extension additionally qualifies by being composed into a pack.

`bun run verify` enforces this. Anything else is dead code that looks canonical.

## Why

Seven packages were found in exactly that state, including a complete, tested
workspace-tab implementation and the sidebar composition layer. The cost was not
theoretical: a bug fix was written, reviewed and merged into the dead tab
package and changed nothing a user saw, and a second fix landed in the dead
sidebar package and had to be dropped before release.

The existing gates could not catch it. `knip` treats each package's entry point
as a root of reachability, so it never asks whether anything imports it — every
package self-certifies as live. `jscpd` compares text, and two implementations
of one feature written in different styles share no clones. Whole-file hashing
only finds byte-identical copies.

## How to apply

- **Before implementing, confirm the code you are about to change actually
  runs.** Check that the package is mounted or imported, not merely that it
  exists and looks canonical.
- When a package becomes unreachable, resolve it — mount it, have its owner
  import it, delete it, or fold it into the live implementation. An exemption is
  a reviewed structural decision with a stated reason and a tracking issue, never
  a way to quiet the gate.

Related: [[no-duplicate-or-legacy-implementations]], [[verification-standard]].
