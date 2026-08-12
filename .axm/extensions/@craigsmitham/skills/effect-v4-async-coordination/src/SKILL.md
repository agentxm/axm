---
name: effect-v4-async-coordination
description: Chooses Effect v4 primitives for asynchronous state, handoff, signaling, broadcast, and admission control. Use when code has homegrown locks, shared mutable arrays, event emitters, polling flags, producer-consumer loops, or concurrency gates—even when Deferred, Queue, PubSub, Ref, or Semaphore are absent. Skip immutable local state and coordination already owned by an external system.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 async coordination

Choose by communication semantics, not familiarity.

## Match the primitive

- `Deferred`: one result or signal completed once and awaited by many.
- `Queue`: each value is handed to one consumer.
- `PubSub`: values are broadcast to active subscribers, subject to the configured loss policy.
- `Ref`: atomic synchronous state changes without waiting.
- `SynchronizedRef`: serialized state changes that require effects.
- `Semaphore`: admission control for a scarce capacity or critical section.

Do not emulate one primitive with another plus mutable flags.

## Define pressure and lifetime

- Prefer bounded queues or pub-sub channels when producers can outrun consumers.
- Choose backpressure, dropping, or sliding as an explicit loss policy.
- Scope subscriptions and coordinate shutdown so blocked producers and consumers can terminate.
- Narrow capabilities at module boundaries, such as enqueue-only or dequeue-only access.
- Keep operations atomic; do not split a read-decide-write transition across separate `Ref` operations.

## Check failure behavior

- Decide what happens when a producer, consumer, or subscriber fails.
- Avoid holding permits across unrelated waiting or unbounded work.
- Do not use coordination primitives to hide an ownership problem; establish the owning scope first.
