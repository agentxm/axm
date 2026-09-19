---
type: Checklist
title: Keyed resource sharing
description: Evaluate whether live resources shared by key have complete identity, scoped borrowing, bounded retention, and safe release.
tags: [effect, effect-v4, rcmap, layermap, pool, keyed-resource, scope]
status: stable
sources:
  - id: effect-rcmap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/RcMap.ts
    title: Effect 4.0.0-rc.115 RcMap source
  - id: effect-layermap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/01_effect/05_resources/30_layer-map.ts
    title: Effect 4.0.0-rc.115 LayerMap guide
  - id: effect-pool
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/Pool.ts
    title: Effect 4.0.0-rc.115 Pool source
generated: { by: codex/gpt-6, at: 2026-09-11T17:32:03Z }
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
- [ ] Decide how acquisition failure is shared, retried, or forgotten and
  prevent a failed entry from becoming permanently sticky by accident.
- [ ] Do not expose an underlying client beyond the borrow scope or close it
  directly while other borrowers may still hold it.
- [ ] Test concurrent same-key acquisition, different keys, last-borrower
  release, acquisition failure, expiry, eviction, and close races.

## Resources

- [RcMap source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/RcMap.ts)
- [LayerMap guide](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/01_effect/05_resources/30_layer-map.ts)
- [Pool source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/Pool.ts)
