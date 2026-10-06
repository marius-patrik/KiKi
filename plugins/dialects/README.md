# dialects

The provider-wire-dialect abstraction: an empty `ctx.dialects` registry (register/unregister/get/list) plus the shared SSE/NDJSON framing primitives every dialect uses. Each concrete wire dialect — `openai`, `claude`, `gemini`, `code-assist`, `antigravity` — is its own extension package (`@dsh-stack/dialect-<id>`) that registers itself into this registry. LLM adapter plugins resolve a dialect by id to serialize requests and translate response streams.
