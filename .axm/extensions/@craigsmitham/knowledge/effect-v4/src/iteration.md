---
type: Guide
title: Iteration
description: Choosing traversal, combination, loop, and Schedule primitives; use when replacing async loops, polling, retries, or manual accumulators.
tags: [effect, effect-v4, iteration, foreach, all, schedule, retry, repeat, traversal]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-iteration/src/SKILL.md
    title: effect-v4-iteration skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Iteration

Choose by effectfulness, shape, cardinality, and time semantics.

**Applies when** replacing `Promise.all`, async loops, polling, retries, manual
accumulators, or unbounded per-item effects, and when deciding among `forEach`,
`all`, `iterate`, `loop`, and `Stream`.

**Leave alone** pure synchronous transformations already clear with ordinary
collection code.

Related: [Structured concurrency](structured-concurrency.md) for the bound you
pick, [Streams](streams.md) when production is lazy or unbounded, [Error
modeling](error-modeling.md) for what is safe to retry.

## Choose the operation

- Use ordinary collection operations or a plain loop for pure synchronous work.
- Use `Effect.forEach` for one effectful operation per element. It preserves
  typed failures and is sequential unless concurrency is explicitly requested.
- Use `Effect.all` for a fixed tuple, struct, or collection of already-built
  effects. It preserves tuple/struct result shape.
- Use `Effect.iterate` or `Effect.loop` for explicit state machines whose
  continuation and emitted values are part of the model.
- Use `Schedule` with retry or repeat for temporal policies. Use `Stream` for
  lazy, unbounded, resource-scoped, or backpressured production of values.

```ts
const results = Effect.forEach(inputs, processOne, {
  concurrency: 8,
})

const pair = Effect.all({ profile: loadProfile, settings: loadSettings }, {
  concurrency: "unbounded",
})
```

## Make execution policy visible

- Concurrency is opt-in. Choose a numeric bound from downstream capacity;
  reserve `"unbounded"` for a genuinely small, fixed set.
- Use `{ discard: true }` when only effects matter and result collection would
  allocate useless output.
- Decide whether failure short-circuits, is accumulated, or becomes per-item
  data. Do not recover broadly merely to keep a loop running.
- Keep retries bounded and conditional on typed retryable failures. Separate
  attempt count, delay/backoff, jitter, and overall timeout.
- Preserve interruption. Do not wrap traversal in detached promises or swallow
  cancellation while waiting between attempts.

## Avoid manual machinery

- Do not use `Promise.all` inside an Effect program.
- Replace `for` + `yield*` + `push` with `Effect.forEach` unless the loop has
  genuinely complex early-exit or state-transition behavior.
- Do not implement polling with recursive sleep flags; model it with repeat,
  retry, Schedule, or Stream according to the result contract.
- A Semaphore is for a concurrency limit shared across call sites; a traversal
  option is enough when one traversal owns the limit.

## Review checklist

- Pure work stays pure; effectful work stays in the Effect channel.
- Sequential versus concurrent execution is explicit.
- Parallelism is bounded by an identified capacity.
- Failure, retry, timeout, and interruption semantics are intentional.
- The selected primitive preserves the required result shape and cardinality.
