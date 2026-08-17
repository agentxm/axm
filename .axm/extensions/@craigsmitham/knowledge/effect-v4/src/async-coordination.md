---
type: Guide
title: Async coordination
description: Choosing among Deferred, Latch, Queue, PubSub, Ref, SynchronizedRef, SubscriptionRef, Semaphore, and the Tx* transactional family; use for homegrown locks, shared mutable state, event emitters, polling flags, or admission control.
tags: [effect, effect-v4, deferred, latch, queue, pubsub, ref, subscription-ref, semaphore, transactions, backpressure, coordination]
status: stable
sources:
  - id: src-queue
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Queue.ts
    title: Queue module source — Queue<A, E>, loss policies, Enqueue/Dequeue narrowing, end vs shutdown (effect 4.0.0-rc.110)
  - id: src-pubsub
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/PubSub.ts
    title: PubSub module source — bounded/dropping/sliding/unbounded, replay, scoped subscribe (effect 4.0.0-rc.110)
  - id: src-semaphore
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Semaphore.ts
    title: Semaphore module source — top-level v4 module, withPermit/withPermits (effect 4.0.0-rc.110)
  - id: src-latch
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Latch.ts
    title: Latch module source — reusable open/closed gate with open, release, close (effect 4.0.0-rc.110)
  - id: src-subscriptionref
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/SubscriptionRef.ts
    title: SubscriptionRef module source — serialized state whose committed updates publish as a stream (effect 4.0.0-rc.110)
  - id: src-txqueue
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/TxQueue.ts
    title: TxQueue module source — transactional Tx* coordination family inside Effect.tx (effect 4.0.0-rc.110)
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-rpc/src/EphemeralHub.ts
    title: effect-local@faa52d9 — sliding PubSub with Semaphore admission and a Deferred departure signal
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/DiscordGateway/Messaging.ts
    title: dfx@23988a4 — acquireRelease-owned Queue and PubSub lifetimes with a mailbox decoupling producers
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/common/src/leader-thread/LeaderSyncProcessor.ts
    title: livestore@31e8d71 — TxQueue batched consumption with SubscriptionRef sync state
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-async-coordination/src/SKILL.md
    title: effect-v4-async-coordination skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:23:56Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:23:56Z
---

# Async coordination

Choose by communication semantics, not familiarity.

**Applies when** code has homegrown locks, shared mutable arrays, event
emitters, polling flags, producer-consumer loops, or concurrency gates — even
when Deferred, Queue, PubSub, Ref, or Semaphore are absent.

**Leave alone** immutable local state, and coordination already owned by an
external system.

Related: [Structured concurrency](structured-concurrency.md) for establishing
the owning scope first, [Streams](streams.md) for consuming a queue or pub-sub
incrementally, [Resource safety](resource-safety.md) for scoped subscriptions.

## Match the primitive

- `Deferred`: one result or signal completed once and awaited by many.
- `Latch`: a reusable open/closed gate; waiters suspend while closed, `open`
  releases current and future waiters, `close` re-arms it.[^src-latch]
- `Queue`: each value is handed to one consumer in offer order.[^src-queue]
- `PubSub`: values are broadcast to active subscribers, subject to the
  configured loss policy.[^src-pubsub]
- `Ref`: atomic synchronous state changes without waiting.
- `SynchronizedRef`: serialized state changes that require effects.
- `SubscriptionRef`: state whose current value is readable now and whose
  committed updates publish as a stream via `changes`.[^src-subscriptionref]
- `Semaphore`: admission control for a scarce capacity or critical
  section.[^src-semaphore]
- `PartitionedSemaphore`: one shared permit pool with waiters grouped by
  partition key, so no busy group monopolizes released permits.[^src-semaphore]
- `TxRef`, `TxQueue`, `TxPubSub`, `TxSemaphore`, and the rest of the Tx*
  family: coordination whose state changes must commit atomically with other
  transactional state inside an `Effect.tx`
  boundary.[^src-txqueue] [^applied-livestore]

Do not emulate one primitive with another plus mutable flags: rc.110 ships a
gate (`Latch`), observable state (`SubscriptionRef`), fair keyed admission
(`PartitionedSemaphore`), and multi-primitive atomicity (Tx*) directly.

A `Semaphore` is for a concurrency limit shared across call sites or
resources; when a single traversal owns the limit, its `concurrency` option is
enough — this guide owns that distinction, [Iteration](iteration.md) applies it
to traversal operations.

## Define pressure and lifetime

- Prefer bounded queues or pub-sub channels when producers can outrun
  consumers.
- Choose backpressure, dropping, or sliding as an explicit loss
  policy.[^src-queue] [^applied-effect-local]
- Scope subscriptions — `PubSub.subscribe` requires a `Scope` — and own
  queue and pub-sub lifetimes with `acquireRelease` so blocked parties
  terminate at shutdown.[^src-pubsub] [^applied-dfx]
- Narrow capabilities at module boundaries, such as enqueue-only (`Enqueue`)
  or dequeue-only (`Dequeue`) access.[^src-queue]
- Keep operations atomic; do not split a read-decide-write transition across
  separate `Ref` operations.

## Complete or shut down explicitly

Queues carry a typed error channel (`Queue<A, E>`) and distinguish completion
from destruction: `Queue.end` stops new offers, lets consumers drain what is
buffered, and then fails takers with `Cause.Done`; `Queue.shutdown` discards
buffered values and resumes pending operations immediately.[^src-queue]

```ts
import { Cause, Effect, Queue } from "effect"

const produce = (jobs: Queue.Enqueue<Job, Cause.Done>) =>
  Effect.gen(function*() {
    for (const job of pending) yield* Queue.offer(jobs, job)
    // Completion, not destruction: consumers drain the queue, then observe Done.
    yield* Queue.end(jobs)
  })
```

The ordered shutdown sequence — stop admitting, signal, drain, interrupt — is
owned by [Structured concurrency](structured-concurrency.md).

## Check failure behavior

- Decide what happens when a producer, consumer, or subscriber fails.
- Avoid holding permits across unrelated waiting or unbounded work.
- Do not use coordination primitives to hide an ownership problem; establish
  the owning scope first.

## Review checklist

- The chosen primitive's communication semantics match the interaction:
  one-shot signal, reusable gate, hand-off, broadcast, observable state,
  admission, or transactional atomicity.
- No primitive is emulated from another plus mutable flags where a shipped
  v4 primitive fits.
- Capacity bounds and loss policy are explicit wherever producers can outrun
  consumers.
- Subscriptions are scoped, and every queue reaches `end` or `shutdown`
  deliberately rather than being abandoned.
- Permits are never held across unrelated waiting, and coordination sits
  inside an owning scope.

[^src-queue]: `packages/effect/src/Queue.ts` at `effect@4.0.0-rc.110` — `Queue<A, E>` hands each value to one consumer in offer order; bounded queues suspend, drop, or slide; `Enqueue`/`Dequeue` interfaces; `end` fails with `Cause.Done` after draining, `shutdown` discards immediately.
[^src-pubsub]: `packages/effect/src/PubSub.ts` at `effect@4.0.0-rc.110` — bounded/dropping/sliding/unbounded constructors with replay; `subscribe` returns an effect requiring `Scope`.
[^src-semaphore]: `Semaphore` (top-level module, since 4.0.0): `packages/effect/src/Semaphore.ts`; `PartitionedSemaphore` (since 4.0.0): `packages/effect/src/PartitionedSemaphore.ts`, both at `effect@4.0.0-rc.110`.
[^src-latch]: `packages/effect/src/Latch.ts` at `effect@4.0.0-rc.110` (since 4.0.0) — `await`/`whenOpen` suspend while closed; `open`, `release`, `close`.
[^src-subscriptionref]: `packages/effect/src/SubscriptionRef.ts` at `effect@4.0.0-rc.110` — serialized updates; `changes` publishes the current value and every committed update as a `Stream`.
[^src-txqueue]: `packages/effect/src/TxQueue.ts` at `effect@4.0.0-rc.110` (Tx* family since 4.0.0) — transactional operations retry and commit together inside `Effect.tx` (`packages/effect/src/Effect.ts`); siblings include `TxRef.ts`, `TxPubSub.ts`, `TxSemaphore.ts`.
[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-rpc/src/EphemeralHub.ts` (effect 4.0.0-beta.103).
[^applied-dfx]: Observed in dfx@23988a4 `src/DiscordGateway/Messaging.ts` (effect 4.0.0-beta.105).
[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/common/src/leader-thread/LeaderSyncProcessor.ts` (effect 4.0.0-beta.99).
