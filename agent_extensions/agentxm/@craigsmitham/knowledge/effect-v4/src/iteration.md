---
type: Checklist
title: Iteration
description: Evaluate whether traversal, repetition, polling, retry, result shape, and concurrency match the operation's semantics.
tags: [effect, effect-v4, foreach, all, schedule, retry, traversal]
status: stable
sources:
  - id: effect-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Effect.ts
    title: Effect 4.0.0-rc.112 traversal and repetition source
  - id: effect-schedule
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schedule.ts
    title: Effect 4.0.0-rc.112 Schedule source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
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
- [ ] Test empty input, partial failure, concurrency limits, ordering, retry
  exhaustion, and interruption during traversal.

## Resources

- [Effect traversal and repetition source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Effect.ts)
- [Schedule source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schedule.ts)
