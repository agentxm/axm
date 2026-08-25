---
type: Guide
title: Keyed resource sharing
description: Sharing one live resource per key across concurrent consumers with RcMap, LayerMap, or Pool; use for per-tenant clients, keyed registries, per-key locks, and release-when-last-user-leaves lifetimes.
tags: [effect, effect-v4, rcmap, layermap, pool, keyed-resources, reference-counting, idle-ttl, tenancy]
status: stable
sources:
  - id: src-rcmap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/RcMap.ts
    title: RcMap module source — make options, get, idle TTL, capacity, invalidate, resource-vs-cache boundary (effect 4.0.0-rc.111)
  - id: docs-layer-map
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/05_resources/30_layer-map.ts
    title: Official Effect docs — per-tenant service layers with LayerMap.Service (effect 4.0.0-rc.111)
  - id: src-layermap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/LayerMap.ts
    title: LayerMap module source — make, Service, get, contextEffect, invalidate (effect 4.0.0-rc.111)
  - id: src-pool
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Pool.ts
    title: Pool module source — make, makeWithTTL, get, invalidate, concurrency (effect 4.0.0-rc.111)
  - id: src-scopedcache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/ScopedCache.ts
    title: ScopedCache module source — policy-driven eviction of scoped entries (effect 4.0.0-rc.111)
  - id: applied-opencode-layermap
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/location-services.ts
    title: opencode@2cba7e2 — LayerMap building one service graph per location key
  - id: applied-opencode-locks
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/storage/storage.ts
    title: opencode@2cba7e2 — RcMap of per-key write locks with zero idle TTL
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/livestore/src/store/StoreRegistry.ts
    title: livestore@31e8d71 — RcMap store registry keyed by Equal/Hash identity
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-rpc/src/EphemeralHub.ts
    title: effect-local@faa52d9 — capacity-bounded RcMap of per-space runtimes
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:22:07Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Keyed resource sharing

Give many concurrent consumers one live resource per key, and release it when
the last user leaves.

**Applies when** consumers need the same per-key client, connection, session,
runtime, or lock — per tenant, store, workspace, or space — and a homemade
`Map` of instances is leaking, rebuilding on every use, or being torn down
while still in use.

**Leave alone** a single unkeyed lifetime owned by one scope or layer
([Resource safety](resource-safety.md)), and reuse of computed values that
need no release ([Request batching and cache](request-batching-and-cache.md)).

Related: [Resource safety](resource-safety.md) for acquisition and release
guarantees each entry still obeys,
[Request batching and cache](request-batching-and-cache.md) for value reuse
and in-flight dedupe, [Services and layers](services-and-layers.md) for the
composition root that owns the map's scope.

## Choose the primitive

- Use `RcMap` when each key names a distinct live resource: acquired on first
  `get`, shared by every concurrent holder, released after the last holding
  scope closes.[^src-rcmap]
- Use `LayerMap` when the per-key resource is a service or service graph built
  by a `Layer`; it is an `RcMap` of built layer contexts and hands each key
  back as a providable `Layer`.[^src-layermap]
- Use `Pool` when resources are interchangeable and only the count matters:
  fibers borrow any item, with size bounds and optional TTL
  shrinking.[^src-pool]
- Use `RcRef` for the unkeyed single-resource form of the same
  reference-counted contract.
- Use `Cache`/`ScopedCache` for values selected by key, not lifetimes held by
  consumers — see [the cache boundary](#draw-the-cache-boundary).

## Share live resources with RcMap

```ts
import { Effect, RcMap } from "effect"

const program = Effect.gen(function*() {
  const clients = yield* RcMap.make({
    lookup: (tenantId: string) =>
      Effect.acquireRelease(connectTenant(tenantId), (client) => client.close),
    idleTimeToLive: "5 minutes",
  })

  // Concurrent gets for "acme" share one live client; the connection is
  // released five minutes after the last holding scope closes.
  yield* Effect.scoped(
    Effect.gen(function*() {
      const client = yield* RcMap.get(clients, "acme")
      yield* client.send("hello")
    }),
  )
})
```

- `RcMap.make` itself requires a `Scope`; build the map once in the owning
  layer or composition root, and closing that scope releases every remaining
  entry.[^src-rcmap]
- `RcMap.get` retains the resource in the caller's current scope: the first
  caller triggers the lookup, concurrent callers share the in-progress
  acquisition, and each holder's scope close releases one reference. Keep the
  holding scope no wider than the use.
- Without `idleTimeToLive`, the resource is released the moment the last
  reference drops — the right default for cheap entries such as per-key
  locks.[^applied-opencode-locks] Set an idle TTL when reacquisition is
  expensive and usage arrives in bursts; it also accepts a per-key function.
- `capacity` bounds the map and adds `Cause.ExceededCapacityError` to `get`'s
  error channel; map that to a domain failure at the boundary instead of
  letting an infrastructure error escape.[^src-rcmap] [^applied-effect-local]
- Keys are compared by value when they implement `Equal` and `Hash`; a key
  object can carry a construction payload while equating only on identity,
  as livestore's store registry keys on `storeId` alone.[^applied-livestore]
- `RcMap.invalidate` removes a key so the next `get` acquires fresh; current
  holders keep the old resource until their scopes close. Use it for broken
  entries rather than restarting the whole map.

## Key whole service graphs with LayerMap

- Extend `LayerMap.Service` with a `lookup` from key to `Layer`, then provide
  the class's `get(key)` layer around each keyed operation; downstream code
  depends on the plain service and never sees the key.[^docs-layer-map]
- The service class exposes `layer` (dependencies provided), `layerNoDeps`,
  `get`, `contextEffect`, and `invalidate`; `idleTimeToLive` and preloading
  are configured where the class is defined.[^src-layermap]
- This scales past one service: opencode builds an entire per-location service
  graph in `lookup` and retires idle locations after a 60-minute
  TTL.[^applied-opencode-layermap]
- Provide the LayerMap service once at the composition root; the per-key
  layers it returns are operation-scoped, not application-scoped
  ([Services and layers](services-and-layers.md)).

## Pool interchangeable resources

- Reach for `Pool` only when consumers must not care which instance they get —
  keyed primitives cannot balance load, and a pool cannot address a specific
  tenant.
- `Pool.make({ acquire, size })` keeps a fixed population;
  `Pool.makeWithTTL({ acquire, min, max, timeToLive })` grows to demand and
  shrinks idle excess.[^src-pool]
- `Pool.get` borrows an item within the current scope and returns it when the
  scope closes; `concurrency` sets how many fibers may share one item
  (default 1), and `Pool.invalidate` retires a broken item so it is not
  handed out again.[^src-pool]
- The pool requires a `Scope` at construction; closing it releases all items.

## Draw the cache boundary

- The deciding question is: must the resource stay alive while someone holds
  it? Reference-counted primitives track every holder and release only after
  the last one leaves. Caches evict by capacity and TTL policy, and a
  `ScopedCache` releases an evicted entry's resources even if a consumer still
  holds the value.[^src-scopedcache]
- RcMap is for resource lifecycles — clients, sessions, connections — not a
  general mutable cache; do not use it as a memo table for plain
  values.[^src-rcmap]
- Deduplicating lookups, batching, and value reuse across time belong to
  [Request batching and cache](request-batching-and-cache.md).
- What acquisition and release must guarantee under failure and interruption
  inside each entry is owned by [Resource safety](resource-safety.md).

## Review checklist

- Every keyed resource family has one owning map; no parallel homemade `Map`
  of instances remains.
- The map is constructed in the layer or root that should bound all entries,
  and closing that scope is the intended shutdown.
- Consumers hold entries through `get` inside a scope no wider than their use.
- Idle TTL and capacity reflect reacquisition cost and memory bounds, and
  capacity failure is mapped to a domain error.
- Broken entries are invalidated per key, not fixed by restarting the map.
- Plain values with no release action live in a cache, not an RcMap.

[^src-rcmap]: `packages/effect/src/RcMap.ts` at `effect@4.0.0-rc.111` — `make` takes `lookup`, optional `idleTimeToLive` (`Duration.Input` or per-key function), and optional `capacity`, requires `Scope`; with `capacity` set, `get` can fail with `Cause.ExceededCapacityError`. The module doc scopes RcMap to resource lifecycles, "not as a general mutable cache".
[^src-layermap]: `packages/effect/src/LayerMap.ts` at `effect@4.0.0-rc.111` — `LayerMap.make`/`LayerMap.Service` wrap an internal `RcMap` of built layer contexts; the service class exposes `layer`, `layerNoDeps`, `get`, `contextEffect`, `invalidate`.
[^docs-layer-map]: `ai-docs/src/01_effect/05_resources/30_layer-map.ts` at `effect@4.0.0-rc.111` — per-tenant `DatabasePool` provided through `PoolMap.get(tenantId)`.
[^src-pool]: `packages/effect/src/Pool.ts` at `effect@4.0.0-rc.111` — `make` (fixed `size`), `makeWithTTL` (`min`/`max`/`timeToLive`, `timeToLiveStrategy` `"creation" | "usage"`), scoped `get`, `invalidate`, per-item `concurrency`, `targetUtilization`.
[^src-scopedcache]: `packages/effect/src/ScopedCache.ts` at `effect@4.0.0-rc.111` — each entry owns a scope released when the entry is removed by expiry, refresh, invalidation, or capacity eviction.
[^applied-opencode-locks]: Observed in opencode@2cba7e2 `packages/opencode/src/storage/storage.ts` (effect 4.0.0-beta.83) — `RcMap.make({ lookup: () => TxReentrantLock.make(), idleTimeToLive: 0 })`.
[^applied-opencode-layermap]: Observed in opencode@2cba7e2 `packages/core/src/location-services.ts` (effect 4.0.0-beta.83).
[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/livestore/src/store/StoreRegistry.ts` (effect 4.0.0-beta.99) — `StoreCacheKey` implements `Equal`/`Hash` over `storeId` while carrying full store options.
[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-rpc/src/EphemeralHub.ts` (effect 4.0.0-beta.103) — per-space runtimes with `capacity` and idle TTL, mapping `Cause.ExceededCapacityError` to a domain error.
