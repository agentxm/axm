---
type: Guide
title: Resource safety
description: Making acquisition and cleanup safe under success, failure, and interruption; use for open/close pairs, `try/finally`, clients, locks, and background work.
tags: [effect, effect-v4, scope, resources, finalizers, interruption, acquire-release, ownership]
status: stable
sources:
  - id: docs-acquire-release
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/05_resources/10_acquire-release.ts
    title: Official Effect docs — acquireRelease inside Layer.effect for a scoped service (effect 4.0.0-rc.111)
  - id: src-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Effect.ts
    title: Effect module source — acquireRelease, acquireUseRelease, acquireDisposable, addFinalizer, ensuring, interruption masks (effect 4.0.0-rc.111)
  - id: src-scope
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Scope.ts
    title: Scope module source — make, provide, fork, close, finalizer strategy (effect 4.0.0-rc.111)
  - id: test-scope
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/Scope.test.ts
    title: Scope tests — finalizer ordering and parallel finalization (effect 4.0.0-rc.111)
  - id: applied-effect-http-recorder
    resource: https://github.com/anomalyco/effect-http-recorder/blob/89e1b85f7caa12ad076b8f9b65c804f89c60ecd0/src/replay/state.ts
    title: effect-http-recorder@89e1b85 — caller-owned Scope constructors with Exit-inspecting finalizers
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-rpc/src/EphemeralHub.ts
    title: effect-local@faa52d9 — acquireRelease pairs owned by a Layer.effect scope
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-resource-safety/src/SKILL.md
    title: effect-v4-resource-safety skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:16Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Resource safety

Give every acquired resource one explicit owner and lifetime.

**Applies when** code has open/close pairs, `try/finally`, clients, files,
locks, subscriptions, servers, or background work whose owner or cancellation
cleanup is unclear — even before Scope APIs are used.

**Leave alone** values with no release action, and externally owned lifetimes
this code must not close.

Related: [Structured concurrency](structured-concurrency.md) for fiber
ownership and cancellation propagation, [Services and
layers](services-and-layers.md) for which services get scoped construction,
[Wrapping](wrapping.md) for adapters that must honor cancellation.

## Choose the lifetime

- Use `acquireUseRelease` for one local use.
- Use `acquireRelease` inside a scope when the resource must survive across
  several operations.
- Use `acquireDisposable` when the resource already implements `Disposable` or
  `AsyncDisposable`; disposal runs when the surrounding scope
  closes.[^src-effect]
- For a shared application service, acquire with `Effect.acquireRelease`
  inside `Layer.effect`, whose scope owns the finalizer — rc.111 has no
  separate `Layer.scoped` constructor.[^docs-acquire-release] Which services
  deserve scoped construction is decided in
  [Services and layers](services-and-layers.md).
- Use `ensuring` for unconditional cleanup that is not itself resource
  acquisition; its own docs steer resource release toward
  `acquireRelease`.[^src-effect]

Prefer the highest-level construct that expresses the lifetime. Manage `Scope`
directly (`make`, `provide`, `fork`, `close`) only when a dynamic or
externally controlled lifetime requires it.[^src-scope] Constructors that
return `Effect<A, E, Scope.Scope>` make the caller the visible
owner.[^applied-effect-http-recorder]

## Preserve guarantees

- Register release immediately after acquisition; do not leave an
  interruptible gap. In rc.111 the acquisition step of `acquireRelease` and
  `acquireUseRelease` is uninterruptible by default; `acquireRelease` accepts
  `{ interruptible: true }` as an explicit opt-out, `acquireUseRelease` has
  none.[^src-effect]
- If acquisition partially succeeds, clean that partial state before failing:
  the release finalizer is registered only after successful acquisition, so
  nothing else will.[^src-effect]
- Finalizers must run correctly after failure or interruption. `addFinalizer`
  and the release function receive the closing `Exit`, so cleanup can observe
  the outcome — useful for end-of-scope invariant
  checks.[^applied-effect-http-recorder]
- Preserve both failures when work and cleanup fail. In rc.111, `onExit` and
  its primitive merge the source and finalizer causes; do not replace that
  combined evidence with a single cleanup error at an adapter boundary.
  [^src-effect]
- Make release idempotent when the underlying API permits repeated or racing
  shutdown.[^applied-effect-local]
- Keep long-running work interruptible. Narrow uninterruptible regions to
  state transitions that must be atomic, using `uninterruptibleMask` with
  `restore` rather than blanket masking.[^src-effect]
- Tie subscriptions and background fibers to the same scope as the resource
  they use; how cancellation propagates through fibers is owned by
  [Structured concurrency](structured-concurrency.md).

## Check ownership

- The component that acquires should usually release.
- Borrowed resources must not be closed by consumers.
- Transfer of ownership should be visible in the API.
- Surface acquisition and release failures according to the surrounding error
  policy; do not silently discard them.

Avoid manual `try/finally` around Effect programs and detached cleanup
promises.

## Review checklist

- Every acquired resource has exactly one owner, expressed with the
  highest-level construct that fits its lifetime.
- No interruptible gap exists between acquisition and finalizer registration,
  and partial acquisition state is cleaned before failing.
- Finalizers behave correctly for success, failure, and interruption, and are
  idempotent where shutdown can race.
- A simultaneous work and cleanup failure preserves both causes.
- Uninterruptible regions are narrow and use the mask/restore idiom.
- Ownership transfer and borrowed lifetimes are visible in API signatures.
- No `try/finally` or detached promise performs cleanup an owner should.

[^src-effect]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.111` — `acquireRelease` (default-uninterruptible acquisition, `{ interruptible: true }` opt-out, finalizer added to the current scope with the closing `Exit`), `acquireUseRelease` (unconditionally protected acquire and release), `acquireDisposable` (`@since 4.0.0`), `addFinalizer`, `ensuring`, `uninterruptibleMask`; `onExitPrimitive` and `onExit` document that source and finalizer causes are merged when both fail.

[^docs-acquire-release]: `ai-docs/src/01_effect/05_resources/10_acquire-release.ts` at `effect@4.0.0-rc.111`; `Layer.effect` runs construction in the layer scope and erases `Scope` from its requirements (`packages/effect/src/Layer.ts`).

[^src-scope]: `packages/effect/src/Scope.ts` at `effect@4.0.0-rc.111` — `make` (sequential or parallel finalizer strategy), `provide`, `fork`, `close`; ordering covered by `packages/effect/test/Scope.test.ts`.

[^applied-effect-http-recorder]: Observed in effect-http-recorder@89e1b85 `src/replay/state.ts` (effect 4.0.0-beta.83) — constructors return `Effect<..., Scope.Scope>` and `Effect.addFinalizer` inspects the closing `Exit` for end-of-scope invariant checks.

[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-rpc/src/EphemeralHub.ts` (effect >=4.0.0-beta.103) — `Effect.acquireRelease` pairs a PubSub with its shutdown and a semaphore permit with its release under a `Layer.effect` scope.
