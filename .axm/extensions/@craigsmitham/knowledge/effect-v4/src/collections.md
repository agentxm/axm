---
type: Guide
title: Collections
description: Choosing among Array, Chunk, Record, and HashMap; use for unsafe indexing, value-based keys, or multi-pass array code.
tags: [effect, effect-v4, array, chunk, record, hashmap, collections, immutability]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-collections/src/SKILL.md
    title: effect-v4-collections skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Collections

Prefer the least specialized immutable representation that preserves the
required semantics.

**Applies when** modeling immutable collections, removing unsafe indexing,
combining Option or Either values, choosing value-based keys, or replacing
multi-pass array code.

**Leave alone** streaming, unbounded, or time-dependent data.

Related: [Streams](streams.md) when delivery is incremental,
[Iteration](iteration.md) when each element performs an effect,
[Option](option.md) for access that can miss.

## Choose the representation

- Default to readonly native arrays and objects. Use Effect's `Array` and
  `Record` modules for typed functional operations over those values.
- Use `Chunk` when repeated concatenation, slicing, or Stream interop makes its
  persistent representation useful. Convert at external JSON and API edges.
- Use `HashMap` when keys are not naturally strings or when Effect `Equal` and
  `Hash` semantics are required. Do not use it merely to avoid an object type.
- Keep public inputs and outputs readonly. Make mutation an implementation
  detail inside one owned boundary, if it is needed at all.

## Transform safely

- Prefer `Array.head`, `Array.get`, and `Array.findFirst` when absence is part
  of the result. Do not hide possible absence with indexing or non-null claims.
- Use `Array.filterMap` or `Array.getSomes` to combine transformation and
  `Option` removal in one pass.
- Use `Array.partition`, `Array.separate`, or `Record.partitionMap` when both
  sides of a classification are needed. Avoid repeating predicates.
- Preserve order deliberately. When order is irrelevant, say so before choosing
  a keyed structure or concurrent traversal.
- Convert a collection once at a boundary instead of repeatedly translating
  between native and Effect representations in the core pipeline.

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
- Multi-pass map/filter or double-filter chains are reduced where one operation
  expresses the intent.
- External boundaries use ordinary serializable values.
- Finite collection work has not been over-modeled as a Stream.
