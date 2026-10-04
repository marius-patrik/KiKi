# agent-kernel

`@dsh-stack/agent-kernel` is the persistent semantic foundation of the DSH agent.

It deliberately contains **no model policy, memory extraction, workflow scheduler, persona logic, or
Omnis dependency**. Those concerns build on this package.

The kernel owns four things:

- one durable agent identity;
- one append-only multi-source event worldline;
- the generic `Environment` / `EventSource` extension contract;
- discovery and invocation of capabilities supplied by registered environments.

State lives under the effective DSH home:

```text
$DSH_HOME/agent/worldline.sqlite3
```

When `DSH_HOME` is unset, the existing DSH default `~/.agents` is used.

## Event ingestion

Every source exposes monotonically increasing unsigned-decimal cursors and stable source event IDs.
The worldline commits the event and source cursor in one SQLite transaction.

Uniqueness is:

```text
(source_id, source_event_id)
```

so reconnect/replay is idempotent. A source cursor may never move backwards for a previously unseen
event.

The kernel stores the source envelope verbatim as canonical JSON. Derived memory belongs to the later
agent-memory package and never rewrites these rows.

## Environment contract

An Environment contributes zero or more EventSources and zero or more capabilities.

An environment is not an agent. Omnis will later be one environment integration; a synthetic test
environment uses this exact interface already.

```ts
interface AgentEnvironment {
  id: string;
  eventSources: readonly EventSource[];
  capabilities: readonly EnvironmentCapability[];
  invoke(capabilityId: string, input: JsonValue): Promise<JsonValue>;
}
```

## Omnis boundary

This package has no `@omnis/*` dependency. The future `integration-omnis` extension will register
an Environment that consumes the same kernel contract as every other environment.

That keeps DSH usable without Omnis and keeps Omnis independent from DSH.
