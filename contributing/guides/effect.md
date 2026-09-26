---
status: active
last-reviewed: 2026-08-18
version: 0.4.0
description: Consult before writing Effect code in AXM. Routes portable Effect v4 topics to the installed skill and Knowledge bundle and records AXM-only policy.
depends-on:
  - ./effect-errors.md
  - ./effect-layers.md
---

# Effect in AXM

The [workspace dependency catalog](../../pnpm-workspace.yaml) owns the Effect
version AXM uses. This guide owns only AXM-specific policy. Select the relevant
guide in the [Effect v4 Knowledge bundle](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/index.md)
and consult the matching dependency source for API details.

Route AXM environment and secret handling to
[config](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/config.md),
runtime logging and telemetry to
[observability](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/observability.md),
and outbound registry transport policy to
[HTTP client](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/http-client.md).

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

### Language-service diagnostics

Library typechecks enable warnings for unknown/any error channels, ambient
dates, ambient dates inside Effects, and missing Effect service dependencies.
Treat new warnings as findings to remediate or classify at the boundary that
owns them.

Keep foreign `unknown` errors at their annotated adapter, inspection, or
process-entry boundary and translate them before they reach application
orchestration. Generated Registry client diagnostics belong to the OpenAPI
generator contract. A prior warning count is not an exception list: inspect
the current source and typecheck result before retaining a boundary.

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
[iteration](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/iteration.md),
[structured concurrency](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/structured-concurrency.md),
and [async coordination](../../agent_extensions/registry/@craigsmitham/knowledge/effect-v4/src/async-coordination.md).

### Reviewed unbounded concurrency

The ESLint rule `axm-policy/no-unbounded-io` covers production source under
`{apps,packages,tools}/**/src`. Every retained literal has an inline disable
directive explaining the fixed catalog or fixed-arity join that bounds its
workload. A new literal requires the same workload review and site-specific
rationale.
