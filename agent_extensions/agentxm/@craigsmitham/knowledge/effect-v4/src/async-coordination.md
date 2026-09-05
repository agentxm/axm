---
type: Checklist
title: Async coordination
description: Evaluate whether the coordination primitive matches the state, signaling, backpressure, exclusivity, and atomicity required.
tags: [effect, effect-v4, deferred, queue, pubsub, ref, semaphore, stm]
status: stable
sources:
  - id: effect-deferred
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Deferred.ts
    title: Effect 4.0.0-rc.112 Deferred source
  - id: effect-queue
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Queue.ts
    title: Effect 4.0.0-rc.112 Queue source
  - id: effect-semaphore
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Semaphore.ts
    title: Effect 4.0.0-rc.112 Semaphore source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Async coordination

- [ ] Match the primitive to the contract: one-shot result (`Deferred`), gate
  (`Latch`), work handoff (`Queue`), broadcast (`PubSub`), state
  (`Ref`), or admission control (`Semaphore`).
- [ ] Choose bounded capacity and overflow behavior for queues and broadcasts
  from the required backpressure and loss policy.
- [ ] Scope subscriptions, permits, and waiters so interruption or shutdown
  cannot leave them registered or held.
- [ ] Define completion and shutdown semantics explicitly so producers and
  consumers agree on end-of-input and failure.
- [ ] Use atomic `Ref` operations instead of separate read/modify/write steps
  when one state transition must not be lost.
- [ ] Use `SynchronizedRef` for effectful serialized transitions and the
  transactional `Tx*` family when several transactional values must change
  atomically.
- [ ] Avoid using mutable flags plus polling where a signal, stream of changes,
  or blocking coordination primitive expresses the event directly.
- [ ] Test contention, interruption while waiting, capacity pressure, shutdown,
  and the atomic invariants the primitive is meant to protect.

## Resources

- [Deferred source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Deferred.ts)
- [Queue source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Queue.ts)
- [Semaphore source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Semaphore.ts)
- [Transactional modules](https://github.com/Effect-TS/effect/tree/effect%404.0.0-rc.112/packages/effect/src)
