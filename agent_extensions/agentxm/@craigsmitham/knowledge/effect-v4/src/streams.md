---
type: Checklist
title: Streams
description: Evaluate whether a zero-to-many workflow has truthful production, backpressure, concurrency, lifetime, and consumption semantics.
tags: [effect, effect-v4, stream, sink, backpressure, resource]
status: stable
sources:
  - id: effect-streams
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/03_stream/20_consuming-streams.ts
    title: Effect 4.0.0-rc.112 stream consumption
  - id: effect-stream-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Stream.ts
    title: Effect 4.0.0-rc.112 Stream source
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/c467b8439be89649e53c3ba76cca063537e030c2/packages/%40livestore/webmesh/src/worker/mod.ts
    title: LiveStore callback stream at c467b84
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Streams

- [ ] Use a stream when an operation can emit zero to many values over time;
  keep single-result operations as Effects.
- [ ] Acquire producers, subscriptions, listeners, cursors, and connections in a
  scope that remains open for the stream's lifetime.
- [ ] Define end-of-stream, typed failure, interruption, and producer shutdown
  behavior for every adapter.
- [ ] Choose buffer capacity and overflow behavior deliberately so backpressure
  or data loss is never accidental.
- [ ] Set effectful mapping and flattening concurrency from downstream capacity,
  and preserve ordering only when required.
- [ ] Retry only the stream segment that is safe to repeat, accounting for
  duplicate or skipped elements at a resumed boundary.
- [ ] Avoid terminal collection of unbounded or unexpectedly large streams; use
  bounded takes, folds, sinks, or incremental consumers.
- [ ] Test empty, finite, failing, interrupted, slow-consumer, and early-
  termination cases, including release of the producer.

## Resources

- [Stream consumption](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/03_stream/20_consuming-streams.ts)
- [Stream source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Stream.ts)
- [Applied callback stream in LiveStore](https://github.com/livestorejs/livestore/blob/c467b8439be89649e53c3ba76cca063537e030c2/packages/%40livestore/webmesh/src/worker/mod.ts)
