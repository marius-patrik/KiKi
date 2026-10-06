# @dsh-stack/dialect-code-assist

The Google Code Assist wire dialect extension. Registers `codeAssistDialect` into the `@dsh-stack/dialects` registry (`stack.ai.dialects`) so `provider-gemini-sub` can resolve it by id at runtime via `ctx.dialects.get("code-assist")`. Depends on `@dsh-stack/dialect-gemini` for shared serialization — the Code Assist endpoint is a JSON wrapper over the same Vertex `GenerateContent` vocabulary the Gemini dialect already serializes.

## Model Experience

No model-facing surface. This is wire-serialization plumbing consumed by provider extensions, not something a model or user interacts with directly.
