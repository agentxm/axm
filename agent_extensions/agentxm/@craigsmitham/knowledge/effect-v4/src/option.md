---
type: Checklist
title: Option
description: Evaluate whether meaningful absence is modeled explicitly and translated cleanly at nullable boundaries.
tags: [effect, effect-v4, option, absence, nullable, schema]
status: stable
sources:
  - id: effect-option
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Option.ts
    title: Effect 4.0.0-rc.112 Option source
  - id: effect-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schema.ts
    title: Effect 4.0.0-rc.112 Schema source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Option

- [ ] Use `Option` when absence is an expected value, not when the operation
  failed or the code has lost information it was required to retain.
- [ ] Translate `null`, `undefined`, missing fields, and sentinel values at
  the boundary that owns their external meaning.
- [ ] Use one optionality convention inside a domain instead of mixing
  `Option`, nullable values, and optional properties without a reason.
- [ ] Handle both `Some` and `None` explicitly with combinators or matching;
  avoid unsafe getters in ordinary application paths.
- [ ] Choose defaults where product or domain policy belongs, not merely to make
  an optional value disappear.
- [ ] Preserve absence through collection transformations unless dropping
  absent values is the named purpose of the operation.
- [ ] Use an explicit schema transformation when `Option` must encode as
  nullable, optional, or another wire representation.
- [ ] Test present, absent, and malformed boundary cases separately.

## Resources

- [Option source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Option.ts)
- [Schema source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schema.ts)
