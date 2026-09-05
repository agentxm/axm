---
type: Checklist
title: Wrapping foreign APIs
description: Evaluate whether synchronous, Promise, and callback APIs become truthful, cancellable, resource-safe Effect boundaries.
tags: [effect, effect-v4, promise, callback, interop, cancellation, adapter]
status: stable
sources:
  - id: effect-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Effect.ts
    title: Effect 4.0.0-rc.112 Effect source
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/ingest.ts
    title: opencode foreign SDK wrapping at dc4449d
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Wrapping foreign APIs

- [ ] Match the wrapper to the foreign operation: pure success, throwing
  synchronous code, Promise, or callback registration.
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

- [Effect interop constructors](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Effect.ts)
- [Applied SDK wrapper in opencode](https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/ingest.ts)
