---
type: Checklist
title: Streams
description: Evaluate whether a zero-to-many workflow has truthful production, backpressure, concurrency, lifetime, and consumption semantics.
tags: [effect, effect-v4, stream, sink, backpressure, resource]
status: stable
sources:
  - id: effect-streams
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/03_stream/20_consuming-streams.ts
    title: Effect 4.1.0 stream consumption
  - id: effect-stream-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Stream.ts
    title: Effect 4.1.0 Stream source
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/c467b8439be89649e53c3ba76cca063537e030c2/packages/%40livestore/webmesh/src/worker/mod.ts
    title: LiveStore callback stream at c467b84
  - id: effect-stream-errors
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/Stream.test.ts
    title: Effect 4.1.0 stream and sink error ownership tests
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Streams

- [ ] Use a stream when an operation can emit zero to many values over time;
  keep single-result operations as Effects.
- [ ] Acquire producers, subscriptions, listeners, cursors, and connections in a
  scope that remains open for the stream's lifetime.
- [ ] Define end-of-stream, typed failure, interruption, and producer shutdown
  behavior for every adapter.
- [ ] Recover failures at their owning stage: sink error handlers do not catch
  upstream stream failures; verify the final exit as well as sink cleanup,
  which observes interruption on upstream failure.[^effect-stream-errors]
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

- [Streaming CSV and schema adapters (unstable, when CSV is the chosen format)](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/encoding/Csv.ts)

- [Stream consumption](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/03_stream/20_consuming-streams.ts)
- [Stream source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Stream.ts)
- [Applied callback stream in LiveStore](https://github.com/livestorejs/livestore/blob/c467b8439be89649e53c3ba76cca063537e030c2/packages/%40livestore/webmesh/src/worker/mod.ts)

[^effect-stream-errors]: [Effect stream and sink error ownership tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/test/Stream.test.ts).
