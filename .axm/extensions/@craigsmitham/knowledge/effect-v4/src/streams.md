---
type: Guide
title: Streams
description: Modeling workflows that produce zero to many values over time; use for manual async iteration, callback consumption, or paginated and unbounded input.
tags: [effect, effect-v4, stream, sink, channel, backpressure, buffering, incremental]
status: stable
sources:
  - id: docs-stream-creating
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/03_stream/10_creating-streams.ts
    title: Official Effect docs — stream constructor catalogue, Stream.callback with acquireRelease unregistration (effect 4.0.0-rc.110)
  - id: docs-stream-consuming
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/03_stream/20_consuming-streams.ts
    title: Official Effect docs — transforming and consuming streams, run* terminals, Sink (effect 4.0.0-rc.110)
  - id: src-stream
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Stream.ts
    title: Stream module source — callback, fromQueue Done exclusion, mapEffect concurrency, groupedWithin, buffer strategies, runCollect (effect 4.0.0-rc.110)
  - id: src-sink
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Sink.ts
    title: Sink module source — composable stream consumers with leftovers (effect 4.0.0-rc.110)
  - id: src-channel
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Channel.ts
    title: Channel module source — low-level substrate beneath Stream and Sink (effect 4.0.0-rc.110)
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-rpc/src/SyncClient.ts
    title: effect-local@faa52d9 — queue bridged into a stream with scoped acquisition and typed failure mapping
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/DiscordGateway/Messaging.ts
    title: dfx@23988a4 — gateway dispatch as Stream.fromPubSub over a scope-owned hub
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/common/src/leader-thread/LeaderSyncProcessor.ts
    title: livestore@31e8d71 — incremental consumption with Stream.tap and runDrain instead of collection
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-streams/src/SKILL.md
    title: effect-v4-streams skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:23:56Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:23:56Z
---

# Streams

Use `Stream` when multiplicity, incremental delivery, or backpressure is part of
the contract.

**Applies when** code performs manual async iteration, consumes events or
callbacks, handles paginated or unbounded input, repeats buffering logic, or
forces a multi-value workflow into one Effect — even without current Stream
usage.

**Leave alone** single-result operations, and small finite collections already
handled clearly by ordinary Effect traversal.

Related: [Iteration](iteration.md) for the finite traversal alternative,
[Async coordination](async-coordination.md) for queue and pub-sub sources,
[Resource safety](resource-safety.md) for scoping listeners and producers.

## Shape the pipeline

- Keep a single result in `Effect`; use `Stream` for zero-to-many values over
  time.
- Adapt queues, pub-sub, async iterables, platform streams, and callbacks at
  the edge; the v4 callback adapter is `Stream.callback` — v3's `Stream.async`
  does not exist in rc.110.[^src-stream] [^applied-dfx]
- Represent normal completion separately from failure: `Stream.fromQueue`
  excludes the queue's `Done` completion signal from the stream's error
  channel.[^src-stream]
- Keep transformations incremental; avoid collecting merely to continue
  processing.[^applied-livestore]

## Make pressure explicit

- Bound concurrency, buffering, and chunk size from expected producer and consumer rates.
- Choose whether ordering matters before parallelizing.
- Make dropping, sliding, batching, and retry policies visible.
- Apply rate limits and time windows where they express domain or external-system constraints.

## Preserve lifetime

- Scope event listeners, subscriptions, files, sockets, and producer
  fibers.[^applied-effect-local]
- Ensure callback adapters unregister on stream completion or
  interruption.[^docs-stream-creating]
- Place retry around the operation that is safe to repeat, not blindly around the entire pipeline.
- Use reusable `Sink` abstractions for meaningful consumers and descend to
  `Channel` only for custom streaming protocols or low-level
  composition.[^src-sink] [^src-channel]

Avoid converting an unbounded stream to an in-memory collection.

## Build and consume deliberately

```ts
import { Stream } from "effect"

const program = Stream.fromIterable(ids).pipe(
  Stream.mapEffect(loadOne, { concurrency: 8 }),
  Stream.groupedWithin(100, "250 millis"),
  Stream.runForEach(writeBatch),
)
```

- Construct finite sources from iterables, effectful sources from effects or
  unfolds, and event sources with an adapter that unregisters on finalization;
  the official constructor catalogue names them all — do not rebuild it
  here.[^docs-stream-creating]
- Prefer `mapEffect` for effectful element processing and choose concurrency and
  ordering based on downstream semantics.
- Use grouping/buffering operators only with explicit size and time policies.
  Decide whether overflow backpressures, drops, or slides.[^src-stream]
- Consume with `runForEach`, a Sink, or another incremental terminal operation.
  Use `runCollect` only when the full finite result is required and bounded; in
  v4 it returns an `Array`, not v3's `Chunk`.[^docs-stream-consuming]
- Remember that a Stream describes work; nothing runs until a terminal consumer
  is executed.

## Review checklist

- The workflow is genuinely zero-to-many or incremental, not one Effect in
  disguise.
- Buffer, chunk, concurrency, ordering, and overflow policy are bounded.
- Resources and callback/listener registration are scoped to consumption.
- Retry surrounds only the safe repeatable segment.
- The terminal consumer does not accidentally materialize unbounded input.
- Constructor and terminal names have been verified against the installed v4
  version, not remembered from v3.

[^src-stream]: `packages/effect/src/Stream.ts` at `effect@4.0.0-rc.110` — `callback` (no `async` export), `fromQueue` returning `Stream<A, Exclude<E, Cause.Done>>`, `mapEffect` with `{ concurrency, unordered }`, `groupedWithin(chunkSize, duration)`, `buffer` with `"suspend" | "dropping" | "sliding"`, `throttle`/`debounce`.
[^docs-stream-creating]: `ai-docs/src/03_stream/10_creating-streams.ts` at `effect@4.0.0-rc.110` — `Stream.callback` registers listeners via `Effect.acquireRelease` so removal runs when the stream finishes.
[^docs-stream-consuming]: `ai-docs/src/03_stream/20_consuming-streams.ts` at `effect@4.0.0-rc.110`; `runCollect` returns `Effect<Array<A>, E, R>` at `packages/effect/src/Stream.ts`.
[^src-sink]: `packages/effect/src/Sink.ts` at `effect@4.0.0-rc.110`.
[^src-channel]: `packages/effect/src/Channel.ts` at `effect@4.0.0-rc.110` — "most application code uses those higher-level modules instead."
[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-rpc/src/SyncClient.ts` (effect 4.0.0-beta.103).
[^applied-dfx]: Observed in dfx@23988a4 `src/DiscordGateway/Messaging.ts` (effect 4.0.0-beta.105).
[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/common/src/leader-thread/LeaderSyncProcessor.ts` (effect 4.0.0-beta.99).
