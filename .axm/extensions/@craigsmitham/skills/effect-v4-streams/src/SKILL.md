---
name: effect-v4-streams
description: Models Effect v4 workflows that produce zero to many values over time. Use for manual async iteration, event or callback consumption, paginated or unbounded input, repeated buffering code, or a multi-value workflow forced into one Effect—even without current Stream usage. Skip single-result operations and small finite collections already handled clearly by ordinary Effect traversal.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 streams

Use `Stream` when multiplicity, incremental delivery, or backpressure is part of the contract.

## Shape the pipeline

- Keep a single result in `Effect`; use `Stream` for zero-to-many values over time.
- Adapt queues, pub-sub, async iterables, platform streams, and callbacks at the edge.
- Represent normal completion separately from failure.
- Keep transformations incremental; avoid collecting merely to continue processing.

## Make pressure explicit

- Bound concurrency, buffering, and chunk size from expected producer and consumer rates.
- Choose whether ordering matters before parallelizing.
- Make dropping, sliding, batching, and retry policies visible.
- Apply rate limits and time windows where they express domain or external-system constraints.

## Preserve lifetime

- Scope event listeners, subscriptions, files, sockets, and producer fibers.
- Ensure callback adapters unregister on stream completion or interruption.
- Place retry around the operation that is safe to repeat, not blindly around the entire pipeline.
- Use reusable `Sink` abstractions for meaningful consumers and descend to `Channel` only for custom streaming protocols or low-level composition.

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
  unfolds, and event sources with an adapter that unregisters on finalization.
- Prefer `mapEffect` for effectful element processing and choose concurrency and
  ordering based on downstream semantics.
- Use grouping/buffering operators only with explicit size and time policies.
  Decide whether overflow backpressures, drops, or slides.
- Consume with `runForEach`, a Sink, or another incremental terminal operation.
  Use `runCollect` only when the full finite result is required and bounded.
- Remember that a Stream describes work; nothing runs until a terminal consumer
  is executed.

## Review checklist

- The workflow is genuinely zero-to-many or incremental, not one Effect in
  disguise.
- Buffer, chunk, concurrency, ordering, and overflow policy are bounded.
- Resources and callback/listener registration are scoped to consumption.
- Retry surrounds only the safe repeatable segment.
- The terminal consumer does not accidentally materialize unbounded input.
