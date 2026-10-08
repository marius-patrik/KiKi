# @dsh-stack/dialect-claude

The Anthropic Claude wire dialect extension. Registers `claudeDialect` into the `@dsh-stack/dialects` registry (`stack.ai.dialects`) so Claude-family provider routes (`provider-anthropic-api`, `provider-claude-sub`) can resolve it by id at runtime via `ctx.dialects.get("claude")`.

## Model Experience

No model-facing surface. This is wire-serialization plumbing consumed by provider extensions, not something a model or user interacts with directly.
