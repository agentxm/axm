---
name: effect-v4-iteration
description: Chooses Effect v4 traversal, combination, loop, and Schedule primitives. Use when replacing Promise.all, async loops, polling, retries, manual accumulators, or unbounded per-item effects, and when deciding among forEach, all, iterate, loop, and Stream. Skip pure synchronous transformations already clear with ordinary collection code.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 iteration

Target exactly `effect@4.0.0-beta.107`. Choose by effectfulness, shape,
cardinality, and time semantics.

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
