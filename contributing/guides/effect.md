---
status: active
last-reviewed: 2026-08-17
version: 0.4.0
description: Consult before writing Effect code in AXM. Routes portable Effect v4 topics to the installed skill and Knowledge bundle and records AXM-only policy.
depends-on:
  - ./effect-errors.md
  - ./effect-layers.md
---

# Effect in AXM

AXM consumes the installed `@craigsmitham/packs/effect-v4` for portable Effect
4.0.0-rc.110 guidance. This guide owns only AXM-specific policy. Use the
installed `craft-effect-v4` skill to select the relevant guide in the
[Effect v4 Knowledge bundle](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/index.md).

> [Effect](../../AGENTS.md#effect) — required repository policy

## Local policy

- Use the repository-matched Effect checkout at
  `../external/Effect-TS/effect` for API verification.
- Use `effect/FileSystem` and `effect/Path`, never `node:fs` or `node:path` in
  production Effect code.
- Let Effect infer `Effect<A, E, R>` for internal functions. Add explicit
  return types only at published package boundaries, for recursion, or when
  TypeScript requires one.
- Alias `effect/Context` as `ServiceMap` where the existing AXM code does so;
  upstream `Context.Service` and local `ServiceMap.Service` name the same API.
- Keep expected operational failures in the typed error channel. Treat a
  failure as a defect only when the surrounding composition proves it cannot
  occur without an invariant violation.
- Express orchestration dependencies in `Effect<A, E, R>` and provide them at
  the owning command or runtime boundary. In Plan workflows, retain step
  requirements in the Plan type and return operation facts through typed step
  results; do not close every leaf independently or mutate captured result
  holders.
- Own resources with `Scope`, `Effect.acquireRelease`, or
  `Effect.acquireUseRelease`. Use `Ref`, `Deferred`, `Queue`, `Semaphore`, and
  other Effect primitives when coordination is the domain need. A cache or
  keyed resource table must have an explicit owner, eviction/release policy,
  and bounded lifetime.
- Follow [Effect Errors](./effect-errors.md) for AXM's `AppError` and
  cancellation boundary.
- Follow [Effect Layers](./effect-layers.md) for AXM CLI composition and
  `runCliMain` policy.

### JSON Schema annotations

Generated JSON Schema emits `identifier`, `title`, `description`, `default`,
`examples`, `readOnly`, `writeOnly`, `format`, `contentEncoding`, and
`contentMediaType`. Decode-only annotations such as `message`,
`messageMissingKey`, `messageUnexpectedKey`, and `meta` are not published.

Annotations on custom `Schema.makeFilter` filters are dropped unless the
filter has JSON Schema-aware metadata. Prefer recognized checks such as
`Schema.isPattern`, then annotate that recognized check. Annotate branded
strings before `.brand()` so examples remain plain encoded values.

## Traversal policy

Concurrency is a workload policy, not a style constant. Before changing a
traversal, classify:

- whether cardinality is fixed and small or varies with workspace/registry
  state;
- which filesystem, process, network, or provider capacity limits it consumes;
- whether order is observable and whether siblings are independent;
- whether failure is fail-fast, accumulated, or best-effort; and
- whether interruption must cancel outstanding work.

Use sequential execution when order or shared mutation requires it. Use
bounded concurrency when a known capacity or representative measurement
supports the bound. Use `"unbounded"` only for demonstrably small fixed inputs
or measured workloads whose downstream resources are already bounded. Record
the reason near a non-obvious choice. A pending performance assessment is a
reason to preserve and measure a candidate policy, not to substitute an
arbitrary numeric cap.

Start with the Knowledge guides for
[iteration](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/iteration.md),
[structured concurrency](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/structured-concurrency.md),
and [async coordination](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/async-coordination.md).
