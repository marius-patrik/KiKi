# @dsh-stack/dialect-antigravity

The Antigravity Gemini wire dialect extension. Registers `antigravityDialect` into the `@dsh-stack/dialects` registry (`stack.ai.dialects`) so `provider-antigravity-sub` can resolve it by id at runtime via `ctx.dialects.get("antigravity")`. Also exports `ANTIGRAVITY_PROJECT_HEADER`, the project-scoping request header the Antigravity route needs directly.

## Model Experience

No model-facing surface. This is wire-serialization plumbing consumed by provider extensions, not something a model or user interacts with directly.
