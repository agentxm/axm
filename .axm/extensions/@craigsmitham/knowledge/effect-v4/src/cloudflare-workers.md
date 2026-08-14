---
type: Guide
title: Cloudflare Workers
description: Integrating Effect with Workers independently of any web framework; use for bindings as Layers, request-scoped runtimes, `waitUntil`, and isolate reuse.
tags: [effect, effect-v4, cloudflare-workers, bindings, waituntil, isolate, hyperdrive, runtime]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-cloudflare-workers/src/SKILL.md
    title: effect-v4-cloudflare-workers skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Cloudflare Workers

Cloudflare supplies bindings at request time while Effect services are normally
assembled through Layers. Make that boundary explicit without depending on
isolate warmth.

**Applies when** mapping Worker bindings into Layers, constructing
request-scoped runtimes, handling `waitUntil`, isolate reuse, configuration,
Hyperdrive or SQL, bundle compatibility, and Worker tests.

**Leave alone** framework-specific routing and non-Cloudflare hosting.

Related: [HTTP API](http-api.md) for the Fetch entry point,
[Config](config.md) for what belongs in `Config` rather than a binding,
[Services and layers](services-and-layers.md) for the layer factory pattern.

## Respect the runtime model

- Keep module-global work small. Defer environment-dependent layer and runtime
  construction until the Worker receives its bindings.
- Treat a warm isolate and cached runtime as performance optimizations. Any
  request must remain correct after a cold start or isolate eviction.
- Bound in-memory caches and fiber lifetimes. Durable state belongs in an
  appropriate Cloudflare storage primitive, not mutable module state.
- Review the deployed compressed bundle and startup behavior. Enable
  `nodejs_compat` only when the dependency graph actually requires supported
  Node APIs and the compatibility date satisfies Cloudflare's requirement.

## Adapt bindings to services

- Accept the Worker `env` object at the entry point and turn each required
  capability into a narrow Effect service or request context.
- Use a Layer factory for long-lived clients whose construction has dependencies
  or cleanup. Use a request service for bindings whose identity is supplied per
  invocation.
- Prefer official Effect integrations for services such as D1 or Durable Object
  SQL when their contract fits. Wrap KV, R2, Queues, AI, or vendor clients in
  domain terms rather than exposing the entire binding API.
- Bindings are objects, not configuration strings. Do not force them through
  `ConfigProvider`; reserve `Config` for string-like deployment settings that
  require parsing, validation, defaulting, or redaction.
- Map Promise failures with `Effect.tryPromise`, pass abort signals where the
  binding supports them, and preserve the safe operation/key context.

## Choose runtime lifetime

- Build per request when layers carry request identity, transaction state, or
  other invocation-local resources.
- Reuse a runtime only when all captured services are safe across requests and
  the cache key accounts for every material environment identity. Do not cache
  request objects, auth context, or transaction-scoped services.
- Make layer memoization intentional. Share one layer value for one shared
  resource; create a fresh layer only when independent acquisition is required.
- Do not rely on process shutdown or isolate finalizers. Close request-owned
  resources within the request scope and use provider-managed pooling for
  cross-request connections.

## Handle post-response work

- Connect bounded Effect work to `ctx.waitUntil` when it is safe for the
  response to complete first.
- Observe/log the task's typed failure; an unobserved rejected promise loses
  useful diagnostics.
- `waitUntil` extends the invocation for a limited period. Use Queues, Workflows,
  Durable Objects, or another durable mechanism when completion is required.
- Keep idempotency and retry semantics explicit because platform retries or
  partial completion may occur outside the original request.

## Database and network boundaries

- Construct Hyperdrive or SQL clients from request-time bindings and provide
  them through one infrastructure layer. Keep credentials out of logs and error
  payloads.
- Define connection ownership, transaction scope, statement timeout, and
  concurrency limits according to the provider's actual capacity.
- Do not create a new pool per repository call or hold a request transaction in
  a module-global runtime.

## Verify like a Worker

- Test layer factories with synthetic bindings and deterministic service
  substitutes.
- Exercise cold construction and warm reuse paths; results must agree.
- Capture promises passed to a fake execution context and assert success,
  failure observation, and durability boundaries.
- Run a Worker-compatible integration/build check that verifies bindings,
  compatibility date/flags, bundle size, and the final Fetch handler.
- Inspect runtime logs for leaked secrets, unhandled task failures, or resource
  acquisition repeated unexpectedly across one request.

## Review checklist

- Every binding has one explicit service or context boundary.
- Correctness is independent of isolate reuse.
- Runtime caching excludes request-scoped identity and resources.
- `waitUntil` is bounded, observed, and not treated as durable execution.
- Compatibility flags, startup work, bundle size, and provider capacity are
  verified against current Cloudflare behavior.
