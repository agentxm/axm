---
type: Checklist
title: Request batching and cache
description: Evaluate whether request coalescing and value reuse have complete identity, bounded lifetime, failure, and invalidation policies.
tags: [effect, effect-v4, request, batching, cache, ttl, resolver]
status: stable
sources:
  - id: effect-request
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Request.ts
    title: Effect 4.1.0 Request source
  - id: effect-resolver
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/RequestResolver.ts
    title: Effect 4.1.0 RequestResolver source
  - id: effect-cache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Cache.ts
    title: Effect 4.1.0 Cache source
  - id: effect-cache-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/Cache.test.ts
    title: Effect 4.1.0 shared lookup cancellation tests
  - id: effect-scoped-cache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/ScopedCache.ts
    title: Effect 4.1.0 cache-owned resource lifetime
  - id: effect-scoped-cache-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/ScopedCache.test.ts
    title: Effect 4.1.0 resource cleanup on cache eviction
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Request batching and cache

- [ ] Decide separately whether the problem is batching nearby requests,
  sharing duplicate in-flight work, or reusing completed values over time.
- [ ] Make the logical key complete, including tenant, authorization, locale,
  version, or other context that can change the result.
- [ ] Bound caches with capacity and time-to-live policies derived from
  staleness tolerance and memory limits.
- [ ] Define whether failures are cached, for how long, and how callers recover;
  do not let transient failure persistence emerge accidentally.
- [ ] Treat caller cancellation separately from cached failure: shared lookup
  work continues while a caller remains, all-callers abandonment interrupts it,
  and an interrupted result must not become a cached value.[^effect-cache-tests]
- [ ] Give invalidation, refresh, and source-of-truth changes an explicit owner.
- [ ] Ensure a `RequestResolver` completes every request in each batch,
  including missing and failed entries, and honors backend batch limits.
- [ ] Use `Cache` for ordinary values and `ScopedCache` for cache-owned resources
  whose callers tolerate cache-controlled finalization: eviction, refresh, or
  invalidation can close a resource while a caller still holds it. Use
  [scoped `RcMap` or `LayerMap` borrowing](keyed-resource-sharing.md) when active
  use must delay release.[^effect-scoped-cache]
- [ ] Test equivalent and distinct keys, concurrent misses, partial batch
  failure, expiry, eviction during active use, invalidation during computation,
  and a fresh lookup during abandoned-work cleanup.[^effect-cache-tests][^effect-scoped-cache-tests]

## Resources

- [RequestResolver source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/RequestResolver.ts)
- [Cache source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Cache.ts)
- [ScopedCache source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/ScopedCache.ts)

[^effect-cache-tests]: [Effect shared lookup cancellation tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/Cache.test.ts).

[^effect-scoped-cache]: Effect cache-owned resource lifetime.

[^effect-scoped-cache-tests]: Effect resource cleanup on cache eviction.
