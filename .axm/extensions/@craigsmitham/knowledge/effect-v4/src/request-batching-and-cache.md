---
type: Guide
title: Request batching and cache
description: Designing batching and keyed reuse; use for N+1 access, duplicate in-flight work, homemade `Map` caches, and TTL decisions.
tags: [effect, effect-v4, request, requestresolver, cache, batching, ttl, n-plus-one]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-request-batching-and-cache/src/SKILL.md
    title: effect-v4-request-batching-and-cache skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Request batching and cache

First decide whether the problem is batching, reuse, or both.

**Applies when** there is N+1 access, repeated identical lookups, duplicate
in-flight work, homemade `Map` caches, bulk-capable backends, TTL decisions, or
cache lifetime bugs — even without existing Request or Cache APIs.

**Leave alone** cheap pure computation. Skip caching — but not necessarily
batching — when freshness or side effects prohibit reuse.

Related: [Structured concurrency](structured-concurrency.md) for bounding
concurrent batches, [Resource safety](resource-safety.md) for scoped caches
whose values need release, [Services and layers](services-and-layers.md) for
placing the cache at the owning boundary.

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
