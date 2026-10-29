---
type: Checklist
title: Async coordination
description: Evaluate whether the coordination primitive matches the state, signaling, backpressure, exclusivity, and atomicity required.
tags: [effect, effect-v4, deferred, queue, pubsub, ref, semaphore, stm]
status: stable
sources:
  - id: effect-deferred
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Deferred.ts
    title: Effect 4.1.0 Deferred source
  - id: effect-queue
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Queue.ts
    title: Effect 4.1.0 Queue source
  - id: effect-semaphore
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Semaphore.ts
    title: Effect 4.1.0 Semaphore source
  - id: applied-opencode-coordination
    resource: https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/core/test/effect/keyed-mutex.test.ts
    title: opencode keyed mutex synchronization tests at 432d870 (Effect 4.0.1)
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Async coordination

- [ ] Match the primitive to the contract: one-shot result (`Deferred`), gate
  (`Latch`), work handoff (`Queue`), broadcast (`PubSub`), state
  (`Ref`), or admission control (`Semaphore`).
- [ ] Choose bounded capacity and overflow behavior for queues and broadcasts
  from the required backpressure and loss policy.
- [ ] Scope subscriptions, permits, and waiters so interruption or shutdown
  cannot leave them registered or held. Use `Semaphore.takeScoped` for a
  scope-long lease and `withPermits` for a single effect; avoid an interruptible
  gap between manual acquisition and registering release.[^effect-semaphore]
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
  and atomic invariants using explicit readiness/release signals; verify
  same-key exclusion, distinct-key progress, and cleanup where applicable
  without guessing timing.[^applied-opencode-coordination]

## Resources

- [Deferred source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Deferred.ts)
- [Queue source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Queue.ts)
- [Semaphore source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Semaphore.ts)
- [Transactional modules](https://github.com/Effect-TS/effect/tree/effect%404.1.0/packages/effect/src)

[^applied-opencode-coordination]: [opencode keyed mutex synchronization tests at 432d870 (Effect 4.0.1)](https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/core/test/effect/keyed-mutex.test.ts).

[^effect-semaphore]: Effect semaphore acquisition and scoped release contracts.
