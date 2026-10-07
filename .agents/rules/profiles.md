---
date: 2026-10-07
status: active
---

# Profiles

Profiles are ordinary DSH profiles. KiKi does not create an aggregate runtime bundle package for them.

KiKi's launcher may reconcile the normal DSH profile manifest, direct plugin rows, local package links, and profile-local overrides required for a development checkout. The logical folders under `plugins/` do not determine profile membership.

DarkFactory and SkyAgent remain under `_migrate/` and are not treated as native KiKi profile capabilities until their migrations are complete.
