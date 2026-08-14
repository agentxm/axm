---
type: Guide
title: Streams
description: Modeling workflows that produce zero to many values over time; use for manual async iteration, callback consumption, or paginated and unbounded input.
tags: [effect, effect-v4, stream, sink, channel, backpressure, buffering, incremental]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-streams/src/SKILL.md
    title: effect-v4-streams skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
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
