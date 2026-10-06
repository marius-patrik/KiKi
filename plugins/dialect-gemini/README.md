# @dsh-stack/dialect-gemini

Shared Google Gemini wire-format serialization helpers (`geminiDialect`, `serializeContents`, `buildToolNameIndex`, `translateGemini`) that `@dsh-stack/dialect-code-assist` wraps — the Code Assist wire is a JSON envelope over the same `GenerateContent` vocabulary. A plain library, not a mountable cordis extension: no current provider route resolves a `gemini` dialect id at runtime (`provider-gemini-api` uses `dialect: "openai"`, Google's OpenAI-compatible endpoint; `provider-gemini-sub` uses `dialect: "code-assist"`).

## Model Experience

No model-facing surface. This is wire-serialization plumbing consumed by provider extensions, not something a model or user interacts with directly.
