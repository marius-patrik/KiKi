# Persistent Agent Runtime and Omnis Integration

Status: accepted target architecture
Date: 2026-10-04

## Decision

DSH Stack becomes the reference persistent agent environment for Omnis, but remains an independent
agent product.

The architectural boundary is strict:

```text
Omnis core
  OmnisOS
  OmnisManager
  OmnisControl
  shared graph + core event journal
        │
        │ @omnis/agent-access or MCP
        ▼
DSH Stack
  persistent agent event kernel
  worldline + memory
  context compiler
  cognition / judgement / intention scheduling
  durable workflows/workers
  learning / procedure induction
  providers / models
  personas / actions / tools
```

Omnis never depends on DSH. DSH can run without Omnis. When DSH is connected to Omnis, Omnis is the
highest-fidelity machine/environment source because it exposes typed state, every first-party event,
and structural Control mutations directly.

## 1. Agent identity

The DSH agent is not a model session, chat transcript, preset, provider, or one executable process.

Its durable identity survives:
- server restart;
- browser/client restart;
- provider/model replacement;
- Omnis disconnect/reconnect;
- host changes;
- individual worker failure.

Durable continuity consists of:
- append-only agent worldline;
- derived memory;
- active durable work/checkpoints;
- references to external identities such as Omnis NodeId/EventId;
- reconstructable indexes and internal state.

The agent can be alive with zero model calls and zero active workers.

## 2. Event kernel

Every meaningful input to the agent becomes one canonical `AgentEvent`.

Sources include:
- user/session messages and interaction;
- DSH tool calls/results;
- provider/model requests/results;
- workflow/worker lifecycle;
- repository/automation events;
- timers;
- external integrations;
- Omnis core events;
- endogenous cognition.

Required envelope fields:

```text
event_id          UUIDv7
source_kind       stable dotted identifier
source_id         stable external/local source identity
source_event_id?  original source identity, e.g. Omnis EventId
source_cursor?    original ordered cursor, e.g. Omnis ingest_seq
observed_wall_ns
observed_monotonic_ns
trace_id
causal_parents[]
entities[]
artifacts[]
payload_type
payload
provenance
```

Source events are never rewritten into newer interpretations. Derived memories may change.

### Omnis ingestion

The Omnis integration:
1. persists its last consumed `ingest_seq`;
2. requests replay from that cursor;
3. imports each event losslessly, retaining Omnis EventId, NodeIds, ArtifactIds and TraceId;
4. commits the DSH worldline event;
5. advances its own cursor transactionally;
6. follows the live stream;
7. reconnects from the persisted cursor after failure.

No screenshot observation, UI polling or scene scraping exists for first-party Omnis state.

## 3. Persistence

Canonical DSH agent state lives under the effective `DSH_HOME`:

```text
$DSH_HOME/agent/worldline.sqlite3
$DSH_HOME/agent/index.sqlite3
$DSH_HOME/agent/checkpoints/
$DSH_HOME/agent/artifacts/
```

`worldline.sqlite3` is append-only source history.
`index.sqlite3` is disposable/rebuildable FTS/vector/statistical state.
`checkpoints/` contains durable workflow/worker continuation artifacts.
Large immutable agent-owned bodies live in `artifacts/` addressed by BLAKE3.

Omnis artifacts remain Omnis artifacts and are referenced by their native identity rather than copied
unless a workflow explicitly snapshots them.

## 4. Memory

Required memory forms:

```text
episode
assertion
entity
relationship
concept
decision
goal
commitment
preference
procedure
skill
artifact
expectation
project-state
self-model
competence estimate
```

Source evidence and interpretation are distinct.

Every derived memory retains evidence references when evidence exists.

Temporal semantics distinguish:
- event time;
- observation time;
- knowledge time;
- validity interval.

A memory may simultaneously have structured semantics, lexical text, graph links, embeddings,
structural/AST representations, source artifacts and abstraction relations. Vectors are indexes, never
truth.

## 5. Working memory and context

Four states are distinct:

```text
long-term memory
working memory
scratch computation
model context
```

Context is compiled per event × worker × purpose. It is never an ever-growing transcript.

A `ContextCapsule` can contain:
- trigger event + causal ancestors;
- relevant current external state;
- active goals/project state;
- episodic/semantic/procedural memory;
- artifacts/code;
- previous attempts and negative evidence;
- tool/capability descriptors;
- disclosure/credential constraints;
- token/byte/time/cost budgets.

Selected evidence identities are persisted with the capsule so every model/worker output is
traceable to what it was shown.

## 6. Judgement and intentions

Event handling is deterministic-first.

Judgement can estimate:
- semantic domain;
- role;
- entities;
- salience;
- novelty;
- uncertainty;
- urgency;
- causal relevance;
- goal/project relevance;
- information value;
- capability/context demand;
- expected cost;
- dispatch topology.

The stack may use deterministic rules, classifiers, embeddings, specialist models and reasoners.
There is no mandatory single executive LLM.

Every judgement produces zero or more candidate intentions. The null intention is always a valid
candidate.

Candidate scheduling:
1. generate candidates from event/memory/goal/contradiction/commitment state;
2. deduplicate semantically equivalent candidates;
3. reject infeasible candidates;
4. estimate progress/information/urgency/risk/novelty/user relevance/cost;
5. remove dominated candidates;
6. allocate bounded resources to one or more candidates;
7. retain deferred candidates;
8. permit null/no work.

There is no semantic `IDLE` state.

## 7. Workers and workflows

A Worker is a durable cognitive activation, not a model session or separate identity.

Initial worker families:
- judgement;
- retrieval;
- reasoning/planning;
- research;
- code;
- verification;
- simulation;
- memory/reflection;
- learning;
- evolution;
- domain specialists.

Every worker consumes a ContextCapsule plus explicit tool/provider/authority grants. Every worker
result re-enters the event kernel.

The existing `loops` scaffold is replaced by a real durable workflow abstraction rather than
growing into a second scheduler.

Workflow primitives:

```text
sequence parallel map fork join race quorum
retry wait-event timeout cancel spawn branch merge yield compensate
```

Planner/executor, debate, research fan-out, speculative coding and reflection are compositions of
these primitives, not privileged modes.

## 8. Package ownership

The target package split is one feature owner per concern:

```text
agent-kernel       durable identity + environment/event-source registry + worldline
agent-memory       derived memory + retrieval/indexes
agent-context      ContextCapsule compiler
agent-cognition    judgement + candidate intention scheduler
agent-workflows    durable Worker/workflow engine; replaces loops
agent-learning     utility/competence/preference/procedure learning
agents             personas and preset materialization only
agent-actions      user/action policy vocabulary only
agent-tools        model-facing tool registration only
providers          model/provider catalog and execution only
automations        repository automation extension point only
integration-omnis  Omnis event source + OS/Manager/Control tools
```

These are canonical implementation packages under `src/packages/`. Publishable plugin/extension
entries compose them according to the existing plugin/extension/pack rules.

A domain pack `pack-agent` composes the persistent agent substrate. Product profiles include that
pack rather than reimplementing its pieces.

## 9. Omnis integration package

`integration-omnis` is an external integration extension, not agent-core code.

It exposes:
- full OmnisOS surface;
- full OmnisManager surface;
- full OmnisControl surface;
- graph queries/resources;
- lossless core event stream.

Preferred transport is the generated `@omnis/agent-access` client.
MCP remains the universal fallback/interoperability surface.

The integration maps Omnis operations directly into DSH tools. It does not create DSH-specific
shadow semantics for the same operation.

Control mutations are structural:
- materialize;
- tree transaction;
- focus/select;
- lens/mode;
- navigate;
- submit input.

When a typed Control operation exists, the agent does not use screenshots or synthetic pointer/
keyboard input.

## 10. Agent-owned graph semantics

DSH does not require its internal memory model to be stored in Omnis.

When connected to Omnis, selected externally useful cognitive state may be projected into an
authorized extension namespace:

```text
ext.dsh.*
```

Examples: active goal/task linkage, current work association, annotations, user-approved persistent
presentation relationships.

The canonical DSH worldline/memory remains DSH-owned. Omnis core remains valid when DSH is absent.

## 11. Providers and models

Providers/models remain DSH resources through the existing provider/catalog/routing system.

The cognitive kernel requests model roles/capabilities rather than hard-coding provider identities
where possible.

OmnisManager model capabilities may be exposed as another provider/inference extension, but are
optional. DSH is not forced through an Omnis inference gateway.

## 12. Credentials and authority

Existing DSH credential-vault rules remain:
- secret material is not memory;
- secret bytes are not serialized into worldline/model context;
- workers receive narrowly scoped handles/placements;
- external integrations expose capability presence without exposing raw credentials.

Omnis authority is inherited from the connected Omnis client/session, never elevated by DSH.

## 13. Learning

Initial adaptive mechanisms:
- retrieval utility statistics;
- provider/binding performance estimates;
- competence estimates by capability + worker class;
- scoped preference learning;
- prediction error;
- procedure induction;
- candidate improvement work.

Learning never rewrites source events.

Repeated successful model-mediated behavior should compile downward toward a cheaper deterministic
tool/procedure when semantics can be preserved.

No hidden RL daemon, online model-weight training loop, or genetic optimizer is part of the initial
runtime.

## 14. Internal dynamics

External user prompts are one event source.

Endogenous events can arise from:
- memory association;
- contradiction;
- prediction error;
- uncertainty;
- novelty;
- competence gap;
- standing commitment;
- hypothesis;
- reflection/consolidation;
- self-observation;
- self-evolution proposal.

These create ordinary candidate intentions. They do not hard-code "idle chores".

Low external demand may bias resource allocation toward consolidation/replay/learning, but the agent
may also do nothing.

## 15. Existing DSH concepts

Existing features keep their narrow roles:

- **persona/preset**: policy/identity presentation, not durable agent identity;
- **action**: temporary behavior/tool/routing policy, not scheduler state;
- **session**: conversational projection, not canonical worldline;
- **provider**: inference realization, not cognition;
- **tool**: callable capability, not workflow;
- **automation**: repository-triggered extension, not the general agent event kernel.

This avoids duplicating the persistent agent architecture inside existing packages whose semantics are
already narrower.

## 16. Hard invariants

1. Event is the basic durable cognitive input.
2. Worldline source events are append-only.
3. Derived memory never replaces source evidence.
4. Context is compiled per activation, not accumulated globally.
5. Worker output re-enters the event kernel.
6. Model/provider identity is replaceable.
7. Null/no work is valid.
8. There is no semantic idle state.
9. Omnis is an integration, not the cognitive substrate.
10. Every Omnis first-party event is consumed directly when connected.
11. DSH can operate without Omnis.
12. Omnis can operate without DSH.
13. No screenshot observation is used for typed Omnis Control state.
14. Existing personas/actions/tools/providers keep one canonical owner.
15. Agent-runtime features are plugins/packages, not patches to upstream harness source.
