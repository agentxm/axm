---
name: effect-v4-request-batching-and-cache
description: Designs Effect v4 request batching and keyed reuse. Use for N+1 access, repeated identical lookups, duplicate in-flight work, homemade `Map` caches, bulk-capable backends, TTL decisions, or cache lifetime bugs—even without existing Request or Cache APIs. Skip cheap pure computation; skip caching, but not necessarily batching, when freshness or side effects prohibit reuse.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 request batching and cache

First decide whether the problem is batching, reuse, or both.

## Choose the abstraction

- Use `Request` plus `RequestResolver` when concurrent logical lookups should be collected and executed in backend batches.
- Use `Cache` when repeated keys should share an in-progress lookup and reuse a result across time.
- Compose both only when their lifetimes and invalidation rules are independently clear.
- Use a scoped cache when cached values themselves require release.

## Define identity and policy

- Request and cache key equality must represent the complete logical input. Missing identity fields create incorrect reuse.
- Set capacity, TTL, and invalidation from freshness and memory requirements, not arbitrary defaults.
- Decide whether failures are cached and for how long.
- Keep caches near the expensive boundary; do not make domain correctness depend on a process-local optimization.

## Make batching total

- Preserve the association between every request and its result.
- Complete every request exactly once, including partial backend failure.
- Respect backend batch limits and bound concurrent batches.
- Keep authorization or tenant context in identity or outside the shared cache boundary as appropriate.

Avoid caching an Effect value in a plain `Map`; that commonly misses in-flight sharing, expiry, and safe invalidation.
