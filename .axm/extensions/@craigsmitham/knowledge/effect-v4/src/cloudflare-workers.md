---
type: Guide
title: Cloudflare Workers
description: Integrating Effect with Workers independently of any web framework; use for bindings as Layers, request-scoped runtimes, `waitUntil`, isolate reuse, and Hyperdrive or SQL bindings.
tags:
  [
    effect,
    effect-v4,
    cloudflare-workers,
    bindings,
    waituntil,
    isolate,
    hyperdrive,
    d1,
    durable-objects,
    runtime,
    otlp,
    scope,
  ]
status: stable
sources:
  - id: src-sql-d1
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/sql/d1/src/D1Client.ts
    title: "@effect/sql-d1 source — D1 binding object adapted into SqlClient layers (4.0.0-rc.111)"
  - id: src-sql-sqlite-do
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/sql/sqlite-do/src/SqliteClient.ts
    title: "@effect/sql-sqlite-do source — Durable Object SQLite integration (4.0.0-rc.111)"
  - id: docs-managed-runtime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/04_integration/10_managed-runtime.ts
    title: Official Effect docs — ManagedRuntime with a shared memo map from a foreign host (effect 4.0.0-rc.111)
  - id: src-effect-trypromise
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Effect.ts
    title: Effect module source — Effect.tryPromise with AbortSignal (effect 4.0.0-rc.111)
  - id: src-otlp-exporter
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/observability/OtlpExporter.ts
    title: OtlpExporter source — scope finalizer performs the final export; Flusher registry is deregistered on close (effect 4.0.0-rc.111)
  - id: src-otlp-tracer
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/observability/OtlpTracer.ts
    title: OtlpTracer source — default shutdownTimeout of 3 seconds (effect 4.0.0-rc.111)
  - id: src-otlp-layers
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/observability/Otlp.ts
    title: Otlp source — combined layers annotated Layer.Layer<never, …> (effect 4.0.0-rc.111)
  - id: src-layer-variance
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Layer.ts
    title: Layer source — Layer is contravariant in ROut (effect 4.0.0-rc.111)
  - id: src-scope-close
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/internal/effect.ts
    title: Scope internals — scopeCloseUnsafe returns early once the scope is Closed (effect 4.0.0-rc.111)
  - id: test-otlp-exporter
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/unstable/observability/OtlpExporter.test.ts
    title: OtlpExporter tests — scope close exports once, and a later flush is a no-op (effect 4.0.0-rc.111)
  - id: cf-docs-waituntil
    resource: https://developers.cloudflare.com/workers/runtime-apis/context/
    title: Cloudflare Workers docs — ExecutionContext.waitUntil semantics
    author: team:cloudflare
    last_modified: 2026-08-17
  - id: cf-docs-waituntil-import
    resource: https://developers.cloudflare.com/changelog/post/2025-08-08-add-waituntil-cloudflare-workers/
    title: Cloudflare Workers changelog — waitUntil importable from the cloudflare:workers module
    author: team:cloudflare
    last_modified: 2026-08-17
  - id: cf-docs-nodejs
    resource: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
    title: Cloudflare Workers docs — nodejs_compat flag and compatibility-date requirements
    author: team:cloudflare
    last_modified: 2026-08-17
  - id: cf-docs-hyperdrive
    resource: https://developers.cloudflare.com/hyperdrive/
    title: Cloudflare docs — Hyperdrive connection pooling
    author: team:cloudflare
    last_modified: 2026-08-17
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/sync-cf/src/cf-worker/worker.ts
    title: livestore@31e8d71 — shipped Cloudflare sync backend validating bindings at the entry point
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/67022d69a8f6070bc938e7a38aaa64a8062f8488/packages/cloudflare-runtime/src/core/RuntimeServices.ts
    title: alchemy@67022d6 — Cloudflare bindings modeled as narrow Effect services
  - id: applied-alchemy-worker-bridge
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Cloudflare/Workers/WorkerBridge.ts
    title: alchemy-effect@1596e50 — Worker fetch bridge; per-event scope, macrotask yield, memoized build pinned per invocation (effect 4.0.0-rc.110)
  - id: applied-alchemy-do-bridge
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Cloudflare/Workers/DurableObjectBridge.ts
    title: alchemy-effect@1596e50 — Durable Object bridge repeating the same close ordering (effect 4.0.0-rc.110)
  - id: applied-alchemy-lambda
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/AWS/Lambda/Function.ts
    title: alchemy-effect@1596e50 — same ordering on a platform with no waitUntil (effect 4.0.0-rc.110)
  - id: applied-alchemy-telemetry
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Telemetry.ts
    title: alchemy-effect@1596e50 — per-event telemetry built into the request scope with export intervals disabled (effect 4.0.0-rc.110)
  - id: applied-alchemy-worker-ctx
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Cloudflare/Workers/Worker.ts
    title: alchemy-effect@1596e50 — ExecutionContext as a service whose raw accessor throws outside a handler (effect 4.0.0-rc.110)
  - id: applied-alchemy-eject
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Http.ts
    title: alchemy-effect@1596e50 — ejected-scope check before the bridge's close-on-return path (effect 4.0.0-rc.110)
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-cloudflare-workers/src/SKILL.md
    title: effect-v4-cloudflare-workers skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
  - by: claude/fable-5
    at: 2026-08-17T20:05:00Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Cloudflare Workers

Cloudflare supplies bindings at request time while Effect services are normally
assembled through Layers. Make that boundary explicit without depending on
isolate warmth. This guide is the sole owner of Workers runtime semantics;
the HTTP contract and its Fetch conversion live in [HTTP API](http-api.md).

**Applies when** mapping Worker bindings into Layers, constructing
request-scoped runtimes, handling `waitUntil`, isolate reuse, configuration,
Hyperdrive or SQL bindings, bundle compatibility, and Worker tests.

**Leave alone** framework-specific routing and non-Cloudflare hosting.

Related: [HTTP API](http-api.md) for the contract and Fetch entry point,
[Config](config.md) for what belongs in `Config` rather than a binding,
[Services and layers](services-and-layers.md) for the layer factory pattern.

Claims below marked as platform claims describe Cloudflare behavior, not
Effect APIs; verify them against current Cloudflare documentation when they
drive a deployment decision.

## Respect the runtime model

- Keep module-global work small. Defer environment-dependent layer and runtime
  construction until the Worker receives its bindings.
- Treat a warm isolate and cached runtime as performance optimizations. Any
  request must remain correct after a cold start or isolate eviction.
- Bound in-memory caches and fiber lifetimes. Durable state belongs in an
  appropriate Cloudflare storage primitive, not mutable module state.
- Review the deployed compressed bundle and startup behavior. Enable
  `nodejs_compat` only when the dependency graph actually requires supported
  Node APIs and the compatibility date satisfies Cloudflare's requirement
  (platform claim).[^cf-docs-nodejs]

## Adapt bindings to services

- Accept the Worker `env` object at the entry point, validate that required
  bindings are present, and turn each required capability into a narrow
  Effect service or request context.[^applied-livestore]
- Use a Layer factory for long-lived clients whose construction has
  dependencies or cleanup. Use a request service for bindings whose identity
  is supplied per invocation.
- Prefer the official Effect integrations where their contract fits:
  `@effect/sql-d1` adapts a `D1Database` binding object directly into
  `SqlClient` layers, and `@effect/sql-sqlite-do` integrates Durable Object
  SQLite.[^src-sql-d1] [^src-sql-sqlite-do] Wrap KV, R2, Queues, AI, or vendor clients in domain terms
  rather than exposing the entire binding API.
- Bindings are objects, not configuration strings. Do not force them through
  `ConfigProvider`; reserve `Config` for string-like deployment settings that
  require parsing, validation, defaulting, or redaction.[^src-sql-d1]
- Map Promise failures with `Effect.tryPromise`, pass its abort signal where
  the binding supports cancellation, and preserve the safe operation/key
  context.[^src-effect-trypromise]

## Choose runtime lifetime

- Build per request when layers carry request identity, transaction state, or
  other invocation-local resources.
- Reuse a runtime only when all captured services are safe across requests
  and the cache key accounts for every material environment identity. The
  official host-integration pattern is a `ManagedRuntime` with an explicitly
  shared memo map and explicit disposal.[^docs-managed-runtime] Do not cache
  request objects, auth context, or transaction-scoped services.
- Make layer memoization intentional. Share one layer value for one shared
  resource; create a fresh layer only when independent acquisition is
  required.
- Do not rely on process shutdown or isolate finalizers. Close request-owned
  resources within the request scope and use provider-managed pooling for
  cross-request connections.

## Handle post-response work

- Bind post-response work to the `ExecutionContext` you were handed. Cloudflare
  does ship a module-global `import { waitUntil } from "cloudflare:workers"`
  (platform claim),[^cf-docs-waituntil-import] but workerd schedules a promise's
  continuations back into the request context that created them and drops them
  once that context has ended. A memoized isolate-level build awaited by several
  concurrent invocations must therefore be pinned by _each_ invocation's own
  `ctx`, not only by whichever one started
  it.[^applied-alchemy-worker-bridge]
- Model the execution context as a service and make the invariant
  unrepresentable rather than documented: expose `waitUntil` as an Effect
  combinator, and let the raw-handle accessor throw outside a request handler so
  init-time code cannot capture a dead context.[^applied-alchemy-worker-ctx]
- Give telemetry a request-scoped lifetime and close that scope exactly once
  from post-response work. `OtlpExporter.make` already registers a
  `Scope.addFinalizer` that performs a final export, bounded by `shutdownTimeout`
  (default 3s) — scope close _is_ the flush, and a `Flusher.flush` issued after
  disposal is a silent no-op because closing deregisters the exporter from the
  flush registry.[^src-otlp-exporter] [^src-otlp-tracer] [^test-otlp-exporter]
- Build exporters into the request scope, never the isolate scope. A Worker's
  module scope is never finalized, so batching fibers and flush finalizers
  attached there never run.[^applied-alchemy-telemetry]
- If the selected HTTP or telemetry stack ends the request's root span in a
  dispatcher task scheduled after the handler effect resolves, yield one
  macrotask before closing the request scope; otherwise the span may miss the
  exporter's buffer. Verify this scheduling behavior in the installed stack.
  The build → run → yield → close ordering is observed in one shared Alchemy
  implementation lineage across Workers, Durable Objects, and Lambda; that is
  evidence for the conditional, not a universal platform rule.
  [^applied-alchemy-worker-bridge] [^applied-alchemy-do-bridge]
  [^applied-alchemy-lambda]
- Effectively disable periodic export per event — set the interval far beyond any
  plausible invocation. An interval export firing mid-event races the close: the
  batch is already spliced out of the buffer when the close interrupts it, so it
  is lost with no error. Keep the standard intervals only for long-lived
  processes whose root scope closes on shutdown.[^src-otlp-exporter] [^applied-alchemy-telemetry]
- Guard the close on the scope's ejected flag. `Scope.close` is itself
  idempotent,[^src-scope-close] so double-close is not the hazard; the hazard is
  closing a scope whose ownership was transferred to a consumer that outlives the
  handler — a streaming response body, a WebSocket upgrade, an RPC stream. That
  consumer closes it when it finishes.[^applied-alchemy-eject] [^applied-alchemy-worker-bridge]
- If you flush explicitly instead of closing a scope, wire `OtlpTracer.layer`,
  `OtlpLogger.layer`, and `OtlpMetrics.layer` individually. `Otlp.layer`,
  `Otlp.layerJson`, and `Otlp.layerProtobuf` are annotated
  `Layer.Layer<never, …>`, and `Layer` is contravariant in `ROut`, so that
  annotation legally erases `OtlpExporter.Flusher`: `yield* OtlpExporter.Flusher`
  does not type-check in a Worker wired that way.[^src-otlp-layers] [^src-layer-variance]
- Observe the task's typed failure; an unobserved rejected promise loses useful
  diagnostics, and platform retries or partial completion may occur outside the
  original request, so keep idempotency explicit.
- `waitUntil` extends the invocation for a bounded window only (currently 30
  seconds past invocation end); it is not durable execution (platform
  claim).[^cf-docs-waituntil] Use Queues, Workflows, Durable Objects, or another
  durable mechanism when completion is required.

## Database and network boundaries

- Construct Hyperdrive or SQL clients from request-time bindings and provide
  them through one infrastructure layer (platform claim for Hyperdrive
  pooling behavior).[^cf-docs-hyperdrive] Keep credentials out of logs and
  error payloads.
- Define connection ownership, transaction scope, statement timeout, and
  concurrency limits according to the provider's actual capacity.
- Do not create a new pool per repository call or hold a request transaction
  in a module-global runtime.

## Verify like a Worker

- Test layer factories with synthetic bindings and deterministic service
  substitutes.
- Exercise cold construction and warm reuse paths; results must agree.
- Capture promises passed to a fake execution context and assert success,
  failure observation, and durability boundaries.
- Run a Worker-compatible integration/build check that verifies bindings,
  compatibility date/flags, bundle size, and the final Fetch handler.
- Inspect runtime logs for leaked secrets, unhandled task failures, or
  resource acquisition repeated unexpectedly across one request.

## Review checklist

- Every binding has one explicit service or context boundary.
- Correctness is independent of isolate reuse.
- Runtime caching excludes request-scoped identity and resources.
- Post-response work — including an awaited isolate-level build — is pinned to
  the invocation's own `ExecutionContext`.
- Telemetry is built into the request scope, and that scope is closed exactly
  once from post-response work unless it was ejected; a pre-close macrotask
  yield is included only when verified scheduling requires it.
- Periodic export intervals are effectively disabled per event.
- `waitUntil` is bounded, observed, and not treated as durable execution.
- Compatibility flags, startup work, bundle size, and provider capacity are
  verified against current Cloudflare behavior.

[^src-sql-d1]: `packages/sql/d1/src/D1Client.ts` at `effect@4.0.0-rc.111` — the official layer takes the `D1Database` binding object directly.

[^src-sql-sqlite-do]: `packages/sql/sqlite-do/src/SqliteClient.ts` at `effect@4.0.0-rc.111`.

[^src-effect-trypromise]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.111` — `tryPromise`'s callback receives an `AbortSignal`.

[^docs-managed-runtime]: `ai-docs/src/04_integration/10_managed-runtime.ts` at `effect@4.0.0-rc.111`.

[^src-otlp-exporter]: `packages/effect/src/unstable/observability/OtlpExporter.ts` at `effect@4.0.0-rc.111` — `make` registers a `Scope.addFinalizer` (line 238) that forks a final `runExport` and awaits it under `Effect.timeoutOption(shutdownTimeout)`; `layerFlusher.register` (line 142) adds a finalizer deleting the exporter from the flush registry; `runExport` splices `buffer` before the HTTP call, so an interrupted in-flight batch is unrecoverable.

[^src-otlp-tracer]: `packages/effect/src/unstable/observability/OtlpTracer.ts` at `effect@4.0.0-rc.111` — `shutdownTimeout: options.shutdownTimeout ?? Duration.seconds(3)` (line 89).

[^src-otlp-layers]: `packages/effect/src/unstable/observability/Otlp.ts` at `effect@4.0.0-rc.111` — `layer` (line 52), `layerJson` (146), and `layerProtobuf` (172) each return `Layer.Layer<never, never, …>`.

[^src-layer-variance]: `packages/effect/src/Layer.ts` at `effect@4.0.0-rc.111` — `interface Layer<in ROut, out E = never, out RIn = never>` (line 54); `ROut` is contravariant, so a `never` annotation is a legal widening that erases the services actually provided.

[^src-scope-close]: `packages/effect/src/internal/effect.ts` at `effect@4.0.0-rc.111` — `scopeCloseUnsafe` returns immediately when `state._tag === "Closed"`, and finalizers run LIFO.

[^test-otlp-exporter]: `packages/effect/test/unstable/observability/OtlpExporter.test.ts` at `effect@4.0.0-rc.111` — "deregisters an exporter when its scope closes" (line 418): `Scope.close` produces exactly one export attempt, and a subsequent `flusher.flush` leaves the count unchanged.

[^cf-docs-waituntil]: Cloudflare Workers ExecutionContext documentation.

[^cf-docs-waituntil-import]: Cloudflare Workers changelog, 2025-08-08 — `waitUntil` is importable from `cloudflare:workers` and behaves as `ctx.waitUntil`. Supported, but it does not tell you _which_ invocation is extended.

[^cf-docs-nodejs]: Cloudflare Workers Node.js compatibility documentation.

[^cf-docs-hyperdrive]: Cloudflare Hyperdrive documentation.

[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/sync-cf/src/cf-worker/worker.ts` (effect 4.0.0-beta.99).

[^applied-alchemy-worker-bridge]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Cloudflare/Workers/WorkerBridge.ts` (effect 4.0.0-rc.110) — the in-flight isolate build is pinned with the calling event's `ctx.waitUntil` (lines 91, 358), telemetry is built into the per-event scope (line 118), and the scope is closed under `ctx.waitUntil` after a `setTimeout(0)` (lines 134-143). The source comment names workerd's `handle_cross_request_promise_resolution` as the failure mode (line 351).

[^applied-alchemy-do-bridge]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Cloudflare/Workers/DurableObjectBridge.ts` (effect 4.0.0-rc.110) — same ordering at lines 149 and 166-173, with `state.waitUntil` as the pin.

[^applied-alchemy-lambda]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/AWS/Lambda/Function.ts` (effect 4.0.0-rc.110) — identical macrotask-then-close ordering at lines 883-900 on a platform with no `waitUntil`; this supports that implementation lineage's exporter-buffer rationale but is not independent evidence of a universal ordering rule.

[^applied-alchemy-telemetry]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Telemetry.ts` (effect 4.0.0-rc.110) — the per-event exporter layer sets `exportInterval: "1 hour"` (lines 384-395) with the race written out in the comment, and `buildEventTelemetry` (line 686) builds into the request scope rather than the never-finalized isolate scope.

[^applied-alchemy-worker-ctx]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Cloudflare/Workers/Worker.ts` (effect 4.0.0-rc.110) — `fromExecutionContext` wraps `ctx.waitUntil` as an Effect combinator (lines 129-141); the init-phase stand-in's `raw` getter throws (line 179).

[^applied-alchemy-eject]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Http.ts` (effect 4.0.0-rc.110) — `isScopeEjected` (line 32) reads the `effect/http/HttpEffect/scopeEjected` marker the HTTP layer sets when scope ownership transfers to a streaming consumer.
