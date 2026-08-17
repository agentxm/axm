---
type: Guide
title: Request batching and cache
description: Deciding between request batching and keyed value reuse, then setting identity, TTL, and failure policy; use for N+1 access, duplicate in-flight work, and homemade `Map` caches.
tags: [effect, effect-v4, request, requestresolver, cache, batching, ttl, n-plus-one]
status: stable
sources:
  - id: docs-batching
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/05_batching/10_request-resolver.ts
    title: Official Effect docs — end-to-end Request and RequestResolver batching (effect 4.0.0-rc.110)
  - id: src-request-resolver
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/RequestResolver.ts
    title: RequestResolver source — entry completion contract, batchN, grouped resolvers (effect 4.0.0-rc.110)
  - id: src-cache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Cache.ts
    title: Cache source — failed exits cached, infinite default timeToLive, exit-aware makeWith (effect 4.0.0-rc.110)
  - id: src-scoped-cache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/ScopedCache.ts
    title: ScopedCache source — per-entry scopes released on expiry, eviction, invalidation, close (effect 4.0.0-rc.110)
  - id: test-request
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/test/Request.test.ts
    title: Request tests — batching behavior, batchN sizing, grouped resolvers (effect 4.0.0-rc.110)
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/account/account.ts
    title: opencode@2cba7e2 — Cache with zero TTL for pure in-flight sharing
  - id: applied-opencode-scoped
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/effect/instance-state.ts
    title: opencode@2cba7e2 — keyed ScopedCache with explicit invalidation hooks
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-request-batching-and-cache/src/SKILL.md
    title: effect-v4-request-batching-and-cache skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:19:16Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:16Z
---

# Request batching and cache

First decide whether the problem is batching, reuse, or both.

**Applies when** there is N+1 access, repeated identical lookups, duplicate
in-flight work, homemade `Map` caches, bulk-capable backends, TTL decisions, or
cache lifetime bugs — even without existing Request or Cache APIs.

**Leave alone** cheap pure computation. Skip caching — but not necessarily
batching — when freshness or side effects prohibit reuse.

Related: [Structured concurrency](structured-concurrency.md) for bounding
concurrency generally, [Keyed resource sharing](keyed-resource-sharing.md) for
live per-key resources released with their last user, [Resource
safety](resource-safety.md) for what release must guarantee, [Services and
layers](services-and-layers.md) for placing the cache at the owning boundary.

## Choose the abstraction

- Use `Request` plus `RequestResolver` when concurrent logical lookups should
  be collected and executed in backend batches.[^docs-batching]
- Use `Cache` when repeated keys should share an in-progress lookup and reuse
  a result across time — including with a zero TTL purely to collapse
  duplicate in-flight work.[^applied-opencode]
- Use `ScopedCache` when cached values themselves require release: each entry
  owns a scope, released on expiry, eviction, invalidation, or cache
  close.[^src-scoped-cache] [^applied-opencode-scoped] What release must
  guarantee is owned by [Resource safety](resource-safety.md).
- Both caches reuse *values*. When consumers need a live per-key resource —
  client, session, connection — shared while in use and released when the last
  user leaves, that is keyed resource sharing (`RcMap` and friends), not a
  cache; see [Keyed resource sharing](keyed-resource-sharing.md).
- Compose batching and caching only when their lifetimes and invalidation
  rules are independently clear.

## Define identity and policy

- Request and cache key equality must represent the complete logical input.
  Missing identity fields create incorrect reuse.
- Set capacity, TTL, and invalidation from freshness and memory requirements,
  not arbitrary defaults.
- Decide failure caching explicitly: rc.110 caches failed lookup exits, and
  the default TTL is infinite, so an error is retained forever unless policy
  says otherwise. `Cache.makeWith`'s `timeToLive: (exit, key) => Duration`
  is the lever — return `Duration.zero` or a short duration for failure
  exits; a fixed `Cache.make` TTL applies to failures too.[^src-cache]
- Keep caches near the expensive boundary; do not make domain correctness
  depend on a process-local optimization.

## Make batching total

- Preserve the association between every request and its result.
- Complete every request exactly once, including under partial backend
  failure. This is an API contract, not just advice: if the resolver's
  `runAll` succeeds while accepted entries are incomplete, the waiting
  requests fail.[^src-request-resolver]
- Respect backend batch limits with `RequestResolver.batchN`; partition
  heterogeneous batches with grouped resolvers.[^src-request-resolver]
  Bounding the fibers that issue requests is owned by
  [Structured concurrency](structured-concurrency.md).
- Keep authorization or tenant context in identity or outside the shared
  cache boundary; each resolver entry carries its own captured context, so
  ambient context does not flow through shared identity.[^docs-batching]

Avoid caching an Effect value in a plain `Map`; that commonly misses in-flight
sharing, expiry, and safe invalidation.

## Review checklist

- The problem is named: batching, reuse, or both — and the abstraction
  matches (resolver, `Cache`, `ScopedCache`, or keyed resource sharing).
- Key equality covers the complete logical input, including tenant or
  authorization identity where it matters.
- Capacity, TTL, and invalidation are chosen from freshness and memory needs;
  failure TTL is an explicit decision, not the infinite default.
- Every accepted resolver entry is completed exactly once on every code path,
  and batch sizes respect backend limits.
- No plain `Map` holds Effect results that need in-flight sharing, expiry, or
  invalidation.

[^docs-batching]: `ai-docs/src/05_batching/10_request-resolver.ts` at `effect@4.0.0-rc.110` — `Request.Class`, `RequestResolver.make` with `entry.completeUnsafe(Exit...)`, `setDelay`, `withCache`, `Effect.request`, and per-entry captured context.
[^src-request-resolver]: `packages/effect/src/RequestResolver.ts` at `effect@4.0.0-rc.110` — `makeWith` gotcha ("Accepted entries must be completed. If `runAll` succeeds with incomplete entries, waiting requests fail."), `batchN`, `makeGrouped`/`grouped`; behavior exercised in `packages/effect/test/Request.test.ts`.
[^src-cache]: `packages/effect/src/Cache.ts` at `effect@4.0.0-rc.110` — the module stores successful and failed results and shares in-progress lookups; `makeWith` takes `timeToLive: (exit, key) => Duration.Input`; the default returns `Duration.infinity` for all exits.
[^src-scoped-cache]: `packages/effect/src/ScopedCache.ts` at `effect@4.0.0-rc.110` — per-entry `Scope` released on expiry, eviction, invalidation, or cache close.
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/opencode/src/account/account.ts` (effect 4.0.0-beta.83) — `Cache.make` with `timeToLive: Duration.zero` collapses concurrent token refreshes per account with no retention.
[^applied-opencode-scoped]: Observed in opencode@2cba7e2 `packages/opencode/src/effect/instance-state.ts` (effect 4.0.0-beta.83) — `ScopedCache` keyed by directory with explicit invalidation hooks so per-instance state releases resources on eviction.
