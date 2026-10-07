---
date: 2026-10-07
status: active
---

# Plugin grouping model

- **Plugin** = one concrete implementation package at `plugins/<group>/<plugin>/`.
- **Logical bundle** = one first-level folder under `plugins/` grouping related plugins for humans and repository navigation.
- A logical bundle has no `package.json`, no `stack.json`, no runtime loader entry, and no profile semantics.
- Package names and `stack.id` values do not depend on the logical bundle folder.
- **Profile composition** uses normal DSH profile configuration and direct plugin rows. It is independent from the repository grouping folders.
- There is no separate extension tree, pack tree, or aggregate `@dsh-stack/bundle*` runtime package.

When one plugin owns unrelated capabilities, split the capabilities into separate plugins and place each in the appropriate logical group.
