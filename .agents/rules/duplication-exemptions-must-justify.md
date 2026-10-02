---
date: 2026-08-28
status: active
---

# Duplication exemptions must justify themselves

The duplicate gate runs at a zero threshold, so `jscpd:ignore-start` is the only
way past it — and therefore the one marker in the tree capable of silencing a
verifier. Every exemption states why the repetition is structural, and every
one is closed.

`bun run verify` enforces both.

## Why

Two different things wear the same marker. Wrapping genuinely structural
repetition is legitimate: per-package `check-plugin.mjs` scaffolding duplicated
by design across siblings, per-provider OAuth flows that are independent despite
looking alike, per-dialect wire shaping where a shared helper would blur real
differences. Wrapping ordinary copy-paste to avoid extracting it is weakening
the gate, which `.agents/rules/verification-standard.md` forbids outright.

Without a written reason the two are indistinguishable, and the second kind
accumulates unnoticed behind the first kind's respectability.

An unclosed exemption is worse still: it silences the remainder of the file
rather than the block it was written for. One was found in
`dialects/src/gemini.ts`, where a stray marker pair left a region open across a
`throw` block that nobody intended to exempt.

## How to apply

- Write `// jscpd:ignore-start -- <why this repetition is structural>` and close
  it with `// jscpd:ignore-end`. A reason shorter than twenty characters is
  treated as absent.
- Exempt the smallest region that needs it, never a whole file.
- If the honest reason is "this should be extracted", extract it.
