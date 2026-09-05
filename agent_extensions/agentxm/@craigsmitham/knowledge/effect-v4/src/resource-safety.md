---
type: Checklist
title: Resource safety
description: Evaluate whether every acquired resource has one explicit owner and reliable cleanup under success, failure, and interruption.
tags: [effect, effect-v4, scope, acquire-release, finalizer, resource]
status: stable
sources:
  - id: effect-acquire-release
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/05_resources/10_acquire-release.ts
    title: Effect 4.0.0-rc.112 acquire-release guide
  - id: effect-scope
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Scope.ts
    title: Effect 4.0.0-rc.112 Scope source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Resource safety

- [ ] Acquire resources through a scoped operation such as
  `Effect.acquireRelease` when they require close, release, unsubscribe, or
  rollback.
- [ ] Register cleanup immediately after successful acquisition so no later
  failure can skip ownership.
- [ ] Keep the resource within the scope that owns it; do not return a live
  handle whose finalizer has already run or whose owner is ambiguous.
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

- [Acquire-release guide](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/05_resources/10_acquire-release.ts)
- [Scope source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Scope.ts)
