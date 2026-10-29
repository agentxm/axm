---
type: Checklist
title: Wrapping foreign APIs
description: Evaluate whether synchronous, Promise, and callback APIs become truthful, cancellable, resource-safe Effect boundaries.
tags: [effect, effect-v4, promise, callback, interop, cancellation, adapter]
status: stable
sources:
  - id: effect-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Effect.ts
    title: Effect 4.1.0 Effect source
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/ingest.ts
    title: opencode foreign SDK wrapping at dc4449d
  - id: effect-functions
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/01_basics/02_effect-fn.ts
    title: Effect 4.1.0 reusable generator functions
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Wrapping foreign APIs

- [ ] Match the wrapper to the foreign operation: pure success, throwing
  synchronous code, Promise, or callback registration.
- [ ] Build reusable generator wrappers with named `Effect.fn` at meaningful
  tracing boundaries or `Effect.fnUntraced` otherwise; pass post-processing
  combinators to the constructor. Keep pure helpers and concise combinator
  functions as ordinary functions, and one-off programs as Effect
  values.[^effect-functions]
- [ ] Convert thrown values, Promise rejections, and callback errors into one
  adapter-owned error type at the boundary.
- [ ] The wrapper's interruption behavior states whether it cancels underlying
  work or only stops waiting, and uses the available abort or cancel hook.
- [ ] Pair listener registration, handles, sockets, clients, and other acquired
  resources with scoped cleanup.
- [ ] Keep vendor SDK objects and raw transport types behind a narrow service
  when application code needs substitution or domain-level behavior.
- [ ] Do not return raw Promises from Effect service methods or start detached
  work inside a wrapper.
- [ ] Preserve the foreign operation's true success, partial-success, timeout,
  and failure semantics instead of flattening them into a boolean or string.
- [ ] Test synchronous throw, asynchronous rejection, cancellation, and cleanup
  in addition to the successful result.

## Resources

- [Effect interop constructors](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/Effect.ts)
- [Applied SDK wrapper in opencode](https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/ingest.ts)

[^effect-functions]: [Effect 4.1.0 reusable generator functions](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/01_basics/02_effect-fn.ts).
