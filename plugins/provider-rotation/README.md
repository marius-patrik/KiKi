# provider-rotation

Automatic same-vendor account failover for `ctx.llm` routes. Groups every
currently registered provider by vendor (stripping a trailing `-<N>` account
suffix) and registers a `<vendor>-pool` adapter for any vendor with two or
more accounts, failing over to the next account on a rate-limit or
quota/balance-exhaustion error that struck before any output streamed.

Point `agent-default-model.provider` (or a session's configured provider) at
the pool id, e.g. `openrouter-pool`, to use rotation. Every original provider
id keeps working unchanged; this is purely additive.
