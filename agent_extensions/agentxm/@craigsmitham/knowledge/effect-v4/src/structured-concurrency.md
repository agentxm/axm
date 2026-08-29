---
type: Checklist
title: Structured concurrency
description: Evaluate whether every child fiber has an owner, bounded policy, observable failure, and deterministic shutdown.
tags: [effect, effect-v4, concurrency, fiber, supervision, interruption, shutdown]
status: stable
sources:
  - id: effect-run-main
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/06_running/10_run-main.ts
    title: Effect 4.0.0-rc.112 scoped background work
  - id: effect-fiberset
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/FiberSet.ts
    title: Effect 4.0.0-rc.112 FiberSet source
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/c467b8439be89649e53c3ba76cca063537e030c2/packages/%40livestore/webmesh/src/worker/mod.ts
    title: LiveStore scoped worker fiber at c467b84
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Structured concurrency

- [ ] Give every child fiber a parent scope, joiner, fiber collection, or
  explicitly external owner; do not leave detached work unaccounted for.
- [ ] The selected combinator implements the stated sibling-failure policy:
  interrupt the rest, collect every result, or isolate the failure.
- [ ] Bound parallelism from service capacity and workload behavior rather than
  defaulting to sequential or unbounded execution.
- [ ] Ensure interruption reaches foreign adapters through their cancellation
  mechanism, or document when it can only stop waiting.
- [ ] Use `FiberSet`, `FiberMap`, or `FiberHandle` for dynamic collections,
  keyed workers, or one replaceable worker instead of an unmanaged registry.
- [ ] Observe background fiber failures through joining, collection failure,
  supervision, or deliberate logging; do not silently discard them.
- [ ] Define shutdown ordering so intake stops, in-flight work settles or is
  interrupted, and owned resources then close.
- [ ] Test sibling failure, losing race branches, parent interruption, dynamic
  worker replacement, and shutdown without leaked fibers.

## Resources

- [Scoped background work](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/06_running/10_run-main.ts)
- [FiberSet source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/FiberSet.ts)
- [Applied scoped worker in LiveStore](https://github.com/livestorejs/livestore/blob/c467b8439be89649e53c3ba76cca063537e030c2/packages/%40livestore/webmesh/src/worker/mod.ts)
