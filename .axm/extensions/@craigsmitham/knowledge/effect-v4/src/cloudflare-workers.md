---
type: Guide
title: Cloudflare Workers
description: Integrating Effect with Workers independently of any web framework; use for bindings as Layers, request-scoped runtimes, `waitUntil`, isolate reuse, and Hyperdrive or SQL bindings.
tags: [effect, effect-v4, cloudflare-workers, bindings, waituntil, isolate, hyperdrive, d1, durable-objects, runtime]
status: stable
sources:
  - id: src-sql-d1
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/sql/d1/src/D1Client.ts
    title: "@effect/sql-d1 source — D1 binding object adapted into SqlClient layers (4.0.0-rc.110)"
  - id: src-sql-sqlite-do
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/sql/sqlite-do/src/SqliteClient.ts
    title: "@effect/sql-sqlite-do source — Durable Object SQLite integration (4.0.0-rc.110)"
  - id: docs-managed-runtime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/04_integration/10_managed-runtime.ts
    title: Official Effect docs — ManagedRuntime with a shared memo map from a foreign host (effect 4.0.0-rc.110)
  - id: src-effect-trypromise
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Effect.ts
    title: Effect module source — Effect.tryPromise with AbortSignal (effect 4.0.0-rc.110)
  - id: cf-docs-waituntil
    resource: https://developers.cloudflare.com/workers/runtime-apis/context/
    title: Cloudflare Workers docs — ExecutionContext.waitUntil semantics
  - id: cf-docs-nodejs
    resource: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
    title: Cloudflare Workers docs — nodejs_compat flag and compatibility-date requirements
  - id: cf-docs-hyperdrive
    resource: https://developers.cloudflare.com/hyperdrive/
    title: Cloudflare docs — Hyperdrive connection pooling
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/sync-cf/src/cf-worker/worker.ts
    title: livestore@31e8d71 — shipped Cloudflare sync backend validating bindings at the entry point
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/67022d69a8f6070bc938e7a38aaa64a8062f8488/packages/cloudflare-runtime/src/core/RuntimeServices.ts
    title: alchemy@67022d6 — Cloudflare bindings modeled as narrow Effect services
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-cloudflare-workers/src/SKILL.md
    title: effect-v4-cloudflare-workers skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:10:36Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
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

- Connect bounded Effect work to `ctx.waitUntil` when it is safe for the
  response to complete first.
- Observe/log the task's typed failure; an unobserved rejected promise loses
  useful diagnostics.
- `waitUntil` extends the invocation for a limited period; it is not durable
  execution (platform claim).[^cf-docs-waituntil] Use Queues, Workflows,
  Durable Objects, or another durable mechanism when completion is required.
- Keep idempotency and retry semantics explicit because platform retries or
  partial completion may occur outside the original request.

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
- `waitUntil` is bounded, observed, and not treated as durable execution.
- Compatibility flags, startup work, bundle size, and provider capacity are
  verified against current Cloudflare behavior.

[^src-sql-d1]: `packages/sql/d1/src/D1Client.ts` at `effect@4.0.0-rc.110` — the official layer takes the `D1Database` binding object directly.
[^src-sql-sqlite-do]: `packages/sql/sqlite-do/src/SqliteClient.ts` at `effect@4.0.0-rc.110`.
[^src-effect-trypromise]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.110` — `tryPromise`'s callback receives an `AbortSignal`.
[^docs-managed-runtime]: `ai-docs/src/04_integration/10_managed-runtime.ts` at `effect@4.0.0-rc.110`.
[^cf-docs-waituntil]: Cloudflare Workers ExecutionContext documentation.
[^cf-docs-nodejs]: Cloudflare Workers Node.js compatibility documentation.
[^cf-docs-hyperdrive]: Cloudflare Hyperdrive documentation.
[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/sync-cf/src/cf-worker/worker.ts` (effect 4.0.0-beta.99).
