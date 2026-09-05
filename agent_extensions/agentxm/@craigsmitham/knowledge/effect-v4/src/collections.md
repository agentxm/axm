---
type: Checklist
title: Collections
description: Evaluate whether collection representation and operations preserve identity, cardinality, ordering, and safety.
tags: [effect, effect-v4, array, chunk, hashmap, record, collections]
status: stable
sources:
  - id: effect-array
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Array.ts
    title: Effect 4.0.0-rc.112 Array source
  - id: effect-hashmap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/HashMap.ts
    title: Effect 4.0.0-rc.112 HashMap source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Collections

- [ ] Choose the representation from required operations: positional sequence,
  persistent chunk, string-keyed record, or value-keyed hash map.
- [ ] Make ordering and duplicate-key behavior part of the contract wherever
  callers can observe them.
- [ ] Use safe lookup and indexing results such as `Option` unless bounds or
  key presence are already proven locally.
- [ ] Prefer immutable collection operations; isolate any mutable builder or
  accumulator to a single construction boundary.
- [ ] Use `HashMap` only when its structural equality and hashing semantics
  match the intended key identity.
- [ ] Select transformations whose result shape matches the requirement:
  mapping, filtering, partitioning, grouping, or effectful traversal.
- [ ] Do not eagerly materialize a potentially large or unbounded source merely
  to gain array operations; retain streaming or iterable structure as needed.
- [ ] Test empty, singleton, duplicate, missing-key, and ordering-sensitive cases
  that matter to the chosen representation.

## Resources

- [Array source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Array.ts)
- [Chunk source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Chunk.ts)
- [HashMap source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/HashMap.ts)
