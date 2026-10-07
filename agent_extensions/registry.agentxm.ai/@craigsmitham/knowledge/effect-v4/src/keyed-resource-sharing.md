---
type: Checklist
title: Keyed resource sharing
description: Evaluate whether live resources shared by key have complete identity, scoped borrowing, bounded retention, and safe release.
tags: [effect, effect-v4, rcmap, layermap, pool, keyed-resource, scope]
status: stable
sources:
  - id: effect-rcmap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/RcMap.ts
    title: Effect 4.0.0 RcMap source
  - id: effect-layermap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/01_effect/05_resources/30_layer-map.ts
    title: Effect 4.0.0 LayerMap guide
  - id: effect-pool
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Pool.ts
    title: Effect 4.0.0 Pool source
  - id: effect-layermap-preload
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/LayerMap.ts#L156-L198
    title: Effect 4.0.0 LayerMap preloading
generated: { by: claude/opus-5.5, at: 2026-10-01T19:24:06Z }
---

# Keyed resource sharing

- [ ] Confirm the cached object is a live resource with acquisition and release,
  not an ordinary value better served by `Cache`.
- [ ] Choose `RcMap` for reference-counted resources by key, `LayerMap` for
  keyed layer graphs, and `Pool` for interchangeable bounded resources.
- [ ] Include every identity-affecting input in the key, especially tenant,
  credentials, endpoint, region, and configuration version.
- [ ] Borrow each resource within a caller scope so release follows actual use
  and the last borrower can trigger cleanup safely.
- [ ] Define idle time-to-live, capacity, and eviction behavior from resource
  cost and reconnect tolerance.
- [ ] Decide whether acquisition failure surfaces at preload or first use,
  and how it is shared, retried, or forgotten; prevent a failed entry from
  becoming permanently sticky by accident.[^effect-layermap-preload]
- [ ] Do not expose an underlying client beyond the borrow scope or close it
  directly while other borrowers may still hold it.
- [ ] Test concurrent same-key acquisition, different keys, last-borrower
  release, acquisition failure, expiry, eviction, and close races.

## Resources

- [RcMap source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/RcMap.ts)
- [LayerMap guide](https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/01_effect/05_resources/30_layer-map.ts)
- [Pool source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Pool.ts)
- [LayerMap preloading](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/LayerMap.ts#L156-L198)

[^effect-layermap-preload]: Effect LayerMap preloading.
