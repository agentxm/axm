---
type: Checklist
title: Iteration
description: Evaluate whether traversal, repetition, polling, retry, result shape, and concurrency match the operation's semantics.
tags: [effect, effect-v4, foreach, all, schedule, retry, traversal]
status: stable
sources:
  - id: effect-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Effect.ts
    title: Effect 4.0.0 traversal and repetition source
  - id: effect-schedule
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Schedule.ts
    title: Effect 4.0.0 Schedule source
  - id: effect-repeat-return
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Effect.ts#L7507-L7520
    title: Effect 4.0.0 Effect.repeat result type
generated: { by: claude/opus-5.5, at: 2026-10-01T19:24:06Z }
---

# Iteration

- [ ] Keep pure collection transformations pure; introduce Effect traversal only
  when an element operation is effectful.
- [ ] Choose a traversal whose result shape matches the contract: values,
  discarded output, partitioned outcomes, first match, reduction, or stream.
- [ ] Traversal options state the required concurrency and whether callers
  require input-ordered output.
- [ ] Bound work that targets databases, APIs, files, or other finite-capacity
  dependencies.
- [ ] Preserve required cardinality and failure information instead of dropping
  failed items or returning partial results accidentally.
- [ ] Use `Schedule` with Effect retry or repetition operators for retries,
  polling, and periodic work rather than manual sleep loops.
- [ ] Retry only transient, repeat-safe operations, with an explicit limit and
  termination condition.
- [ ] When a count or schedule bounds repetition that also has a stop
  condition, handle the result of the bound ending first instead of assuming
  the condition held.[^effect-repeat-return]
- [ ] Test empty input, partial failure, concurrency limits, ordering, retry
  exhaustion, and interruption during traversal.

## Resources

- [Effect traversal and repetition source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Effect.ts)
- [Schedule source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Schedule.ts)
- [Effect.repeat result type](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Effect.ts#L7507-L7520)

[^effect-repeat-return]: Effect.repeat result type.
