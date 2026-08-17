---
type: Guide
title: Collections
description: Choosing among Array, Chunk, Record, and HashMap; use for unsafe indexing, value-based keys, or multi-pass array code.
tags: [effect, effect-v4, array, chunk, record, hashmap, collections, immutability]
status: stable
sources:
  - id: src-array
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Array.ts
    title: Array module source — Option accessors, Result-based filterMap/partition/separate, getSomes (effect 4.0.0-rc.110)
  - id: src-record
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Record.ts
    title: Record module source — Result-based partition and separate (effect 4.0.0-rc.110)
  - id: src-chunk
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Chunk.ts
    title: Chunk module source — efficient append, prepend, and concatenation rationale (effect 4.0.0-rc.110)
  - id: src-hashmap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/HashMap.ts
    title: HashMap module source — structural-equality keys, HAMT structural sharing (effect 4.0.0-rc.110)
  - id: src-stream
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Stream.ts
    title: Stream module source — plain-array chunking, fromArray, runCollect (effect 4.0.0-rc.110)
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/Interactions/builder.ts
    title: dfx@23988a4 — Chunk accumulation in a builder, converted once at the boundary
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/67022d69a8f6070bc938e7a38aaa64a8062f8488/packages/alchemy/src/AWS/Lambda/MicrovmBinding.ts
    title: alchemy@67022d6 — immutable HashMap held in a Ref for keyed memoization
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-collections/src/SKILL.md
    title: effect-v4-collections skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:19:38Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:38Z
---

# Collections

Prefer the least specialized immutable representation that preserves the
required semantics.

**Applies when** modeling immutable collections, removing unsafe indexing,
combining Option or Result values, choosing value-based keys, or replacing
multi-pass array code.

**Leave alone** streaming, unbounded, or time-dependent data.

Related: [Streams](streams.md) when delivery is incremental,
[Iteration](iteration.md) when each element performs an effect,
[Option](option.md) for access that can miss.

## Choose the representation

- Default to readonly native arrays and objects. Use Effect's `Array` and
  `Record` modules for typed functional operations over those values.
- Use `Chunk` when repeated append, prepend, or concatenation makes its
  persistent representation useful — a builder accumulating definitions, for
  example — and convert once at the consumption boundary with
  `Chunk.toReadonlyArray`.[^src-chunk] [^applied-dfx] No Stream API requires
  Chunk: rc.110 streams chunk with plain arrays (`Stream.fromArray`,
  `runCollect` returning `Array`).[^src-stream] Convert at external JSON and
  API edges.
- Use `HashMap` when keys need Effect's `Equal` and `Hash` structural
  equality, or when an immutable map held in a `Ref` needs efficient
  persistent update — legitimate even with string keys.[^src-hashmap]
  [^applied-alchemy] Do not use it merely to avoid an object type.
- Keep public inputs and outputs readonly. Make mutation an implementation
  detail inside one owned boundary, if it is needed at all — `MutableHashMap`
  behind a module's own registry, for instance.

## Transform safely

- Prefer `Array.head`, `Array.get`, and `Array.findFirst` when absence is part
  of the result; `Array.getUnsafe` is the explicit opt-out. Do not hide
  possible absence with indexing or non-null claims.[^src-array]
- Classify with Result-returning functions: `Array.filterMap` keeps successes,
  and `Array.partition`, `Array.separate`, or `Record.partition` keep both
  sides. An Option-returning callback does not type-check in `filterMap`;
  `Record.partitionMap` does not exist.[^src-array] [^src-record]
- Use `Array.getSomes` to remove `Option` in one pass; Option removal is not
  `filterMap`'s job in rc.110.[^src-array]
- Preserve order deliberately. When order is irrelevant, say so before choosing
  a keyed structure or concurrent traversal.
- Convert a collection once at a boundary instead of repeatedly translating
  between native and Effect representations in the core pipeline.

```ts
import { Array, Option, Result } from "effect"

const parsePort = (s: string): Result.Result<number, string> => {
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? Result.succeed(n) : Result.fail(s)
}

declare const inputs: ReadonlyArray<string>
declare const lookups: ReadonlyArray<Option.Option<number>>

const ports = Array.filterMap(inputs, parsePort) // keep successes
const [invalid, valid] = Array.partition(inputs, parsePort) // keep both sides
const found = Array.getSomes(lookups) // Option removal is getSomes, not filterMap
```

## Keep concerns separate

- Collection modules are for finite in-memory values. Use an Effect traversal
  when each element performs an effect, and use `Stream` when incremental
  delivery, backpressure, or resource lifetime is part of the contract.
- A missing element is `Option`; a failed lookup or decode remains a typed
  failure. Do not collapse absence and failure into the same sentinel.
- Schema owns decoding and encoding. Collection code receives trusted element
  values and preserves their invariants.

## Review checklist

- Native arrays or objects remain the default unless Chunk or HashMap semantics
  are explicit.
- Access that can miss returns `Option`; no unsafe indexing is introduced.
- Classification callbacks return `Result`; Option removal uses `getSomes`.
- Multi-pass map/filter or double-filter chains are reduced where one operation
  expresses the intent.
- External boundaries use ordinary serializable values.
- Finite collection work has not been over-modeled as a Stream.

[^src-array]: `packages/effect/src/Array.ts` at `effect@4.0.0-rc.110` — `get`/`head`/`findFirst` return `Option`, `getUnsafe` is the unsafe alternative, `filterMap` and `partition` take `(a, i) => Result<B, X>`, `separate` is `partition(identity)`, `getSomes` extracts present Option values.
[^src-record]: `packages/effect/src/Record.ts` at `effect@4.0.0-rc.110` — `Record.partition` takes a Result-returning function and preserves keys; `Record.separate` splits a record of Results; no `partitionMap` export exists.
[^src-chunk]: `packages/effect/src/Chunk.ts` at `effect@4.0.0-rc.110` — module header: "designed for efficient append, prepend, and concatenation", plus slicing and array conversion.
[^src-stream]: `packages/effect/src/Stream.ts` at `effect@4.0.0-rc.110` — no Chunk import; `fromArray`/`fromArrays` constructors and `runCollect` returning `Effect<Array<A>, E, R>`.
[^src-hashmap]: `packages/effect/src/HashMap.ts` at `effect@4.0.0-rc.110` — keys hashed and matched with Effect's structural equality rules; HAMT structural sharing.
[^applied-dfx]: Observed in dfx@23988a4 `src/Interactions/builder.ts` (effect peer `>=4.0.0-beta.101`) — `Chunk.append`/`appendAll`/`map` accumulation, `Chunk.toReadonlyArray` at consumption.
[^applied-alchemy]: Observed in alchemy@67022d6 `packages/alchemy/src/AWS/Lambda/MicrovmBinding.ts` (`Ref<HashMap>` memoization) and `packages/cloudflare-runtime/src/core/registry/Registry.ts` (`MutableHashMap` inside one owned boundary), effect peer `>=4.0.0-beta.105`.
