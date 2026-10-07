---
type: Checklist
title: Resource safety
description: Evaluate whether every acquired resource has one explicit owner and reliable cleanup under success, failure, and interruption.
tags: [effect, effect-v4, scope, acquire-release, finalizer, resource]
status: stable
sources:
  - id: effect-acquire-release
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/01_effect/05_resources/10_acquire-release.ts
    title: Effect 4.0.0 acquire-release guide
  - id: effect-scope
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Scope.ts
    title: Effect 4.0.0 Scope source
generated: { by: claude/opus-5.5, at: 2026-10-01T19:24:06Z }
---

# Resource safety

- [ ] Acquire resources through a scoped operation such as
  `Effect.acquireRelease` when they require close, release, unsubscribe, or
  rollback.
- [ ] Register cleanup immediately after successful acquisition so no later
  failure can skip ownership.
- [ ] Keep the resource within the scope that owns it; do not return a live
  handle whose finalizer has already run or whose owner is ambiguous.
- [ ] Close only scopes the code created with `Scope.make` or `Scope.fork`;
  leave a scope received from a caller, layer, or runtime to its
  owner.[^effect-scope]
- [ ] Cleanup remains safe after partial initialization and after any repeated
  invocation the foreign API permits.
- [ ] Use layers to own long-lived service resources and narrower scopes for
  request, transaction, lease, subscription, or temporary resources.
- [ ] Keep blocking or asynchronous release work inside Effect and preserve
  meaningful cleanup failures or causes according to the boundary contract.
- [ ] Avoid manual async `try/finally` when Effect's scope can express the
  lifetime and interruption behavior directly.
- [ ] Test acquisition failure, use failure, interruption during use, and normal
  completion, asserting that cleanup occurs exactly as required.

## Resources

- [Acquire-release guide](https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/01_effect/05_resources/10_acquire-release.ts)
- [Scope source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Scope.ts)

[^effect-scope]: Effect Scope source.
