# provider-ollama

Registers the `ollama` provider route (base URL, dialect, credential slots, advisory model fallback, and — where the provider publishes one — a live model-catalog endpoint) into the `providers` registry abstraction (`@dsh-stack/providers`), the same way `agent-preset-coding` registers a preset resource into `agents`.
