# @dsh-stack/dialect-openai

The OpenAI-compatible wire dialect extension. Registers `openaiDialect` into the `@dsh-stack/dialects` registry (`stack.ai.dialects`) so provider routes that speak the OpenAI-compatible wire format — the large majority of Stack's provider extensions — can resolve it by id at runtime via `ctx.dialects.get("openai")`.

## Model Experience

No model-facing surface. This is wire-serialization plumbing consumed by provider extensions, not something a model or user interacts with directly.
