---
type: Checklist
title: Request batching and cache
description: Evaluate whether request coalescing and value reuse have complete identity, bounded lifetime, failure, and invalidation policies.
tags: [effect, effect-v4, request, batching, cache, ttl, resolver]
status: stable
sources:
  - id: effect-request
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Request.ts
    title: Effect 4.0.0-rc.112 Request source
  - id: effect-resolver
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/RequestResolver.ts
    title: Effect 4.0.0-rc.112 RequestResolver source
  - id: effect-cache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Cache.ts
    title: Effect 4.0.0-rc.112 Cache source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
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
- [ ] Give invalidation, refresh, and source-of-truth changes an explicit owner.
- [ ] Ensure a `RequestResolver` completes every request in each batch,
  including missing and failed entries, and honors backend batch limits.
- [ ] Use `ScopedCache` only when the cached value itself owns a resource;
  ordinary value caches must not hide live handles.
- [ ] Test equivalent and distinct keys, concurrent misses, partial batch
  failure, expiry, invalidation, capacity eviction, and interruption.

## Resources

- [RequestResolver source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/RequestResolver.ts)
- [Cache source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Cache.ts)
- [ScopedCache source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/ScopedCache.ts)
