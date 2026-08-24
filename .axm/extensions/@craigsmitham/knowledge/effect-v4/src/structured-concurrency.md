---
type: Guide
title: Structured concurrency
description: Giving every child fiber an owner, failure policy, and shutdown path — including dynamic FiberSet, FiberMap, and FiberHandle collections; use for detached promises, `AbortController`, manual races, or orphanable background tasks.
tags:
  [
    effect,
    effect-v4,
    concurrency,
    fibers,
    forking,
    supervision,
    cancellation,
    shutdown,
    fiberset,
    fibermap,
    fiberhandle,
  ]
status: stable
sources:
  - id: src-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Effect.ts
    title: Effect module source — fork variants, race and timeout interruption, `all` result mode (effect 4.0.0-rc.110)
  - id: docs-run-main
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/06_running/10_run-main.ts
    title: Official Effect docs — forkScoped background work owned by the program scope (effect 4.0.0-rc.110)
  - id: src-fiberset
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/FiberSet.ts
    title: FiberSet module source — scoped worker collections, makeRuntime (effect 4.0.0-rc.110)
  - id: src-fibermap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/FiberMap.ts
    title: FiberMap module source — keyed per-entity fibers in one scope (effect 4.0.0-rc.110)
  - id: src-fiberhandle
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/FiberHandle.ts
    title: FiberHandle module source — single replaceable fiber, onlyIfMissing (effect 4.0.0-rc.110)
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/DiscordGateway/Shard.ts
    title: dfx@23988a4 — forkScoped gateway loops and a FiberHandle-owned reconnect fiber
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/session/run-coordinator.ts
    title: opencode@2cba7e2 — FiberSet.makeRuntime spawning owned fibers from callbacks
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-browser/src/internal/leadership.ts
    title: effect-local@faa52d9 — raceFirst leadership election under a scope-owned fiber
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-structured-concurrency/src/SKILL.md
    title: effect-v4-structured-concurrency skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:20:34Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:20:34Z
---

# Structured concurrency

Every child fiber should have an owner, a failure policy, and a shutdown path.

**Applies when** code uses detached promises, `Promise.all`, `AbortController`,
manual races, orphanable background tasks, or unbounded parallelism — even
without existing fibers.

**Leave alone** sequential work, and intentionally external jobs whose lifetime
is owned by another system.

Related: [Iteration](iteration.md) for choosing the traversal primitive and its
concurrency bound, [Resource safety](resource-safety.md) for scoped cleanup and
uninterruptible regions, [Async coordination](async-coordination.md) for
coordination primitives such as Semaphore.

## Prefer structured operations

- Use `Effect.all`, `forEach`, racing, timeout, and other high-level
  combinators when the parent should await a result; the combinator owns and
  interrupts the child fibers.[^src-effect]
- Decide whether the first failure interrupts siblings or whether every
  outcome is collected as data — `Effect.all` with `mode: "result"` and
  `Effect.partition` run every effect and return outcomes as values. Preserve
  every failure the contract requires.[^src-effect]
- Expect losing race branches and timed-out work to be interrupted. Use
  race/timeout only when losing work may be interrupted safely; a foreign
  adapter must accept cancellation or clearly state that interruption only
  stops waiting.[^src-effect] [^applied-effect-local]
- Preserve input/output ordering only when required, because it can constrain
  streaming or completion behavior.
- Which traversal primitive to use, what concurrency bound to set, and when a
  shared Semaphore replaces a per-traversal bound are owned by
  [Iteration](iteration.md).

## Fork with a lifetime

- Use `forkChild` for work supervised by the parent and `forkScoped` for work
  owned by the current scope, which adds `Scope` to the requirements and
  interrupts the fiber when the scope closes.[^src-effect] [^docs-run-main]
- Use `forkIn` only when an explicit scope is the real owner.
- Treat `forkDetach` as an exceptional daemon choice. Document who observes
  failure and stops it.[^src-effect]
- Join, interrupt, or otherwise observe fibers whose outcome matters. Pipe a
  background loop's failure cause into logging or supervision; a daemon with
  no failure observer is lost work.[^applied-dfx]

## Own dynamic fibers

When fibers start in response to runtime events rather than at composition
time, keep them in a scoped container instead of loose forks:

- `FiberSet` owns a collection of worker fibers: completed fibers remove
  themselves, and closing the scope interrupts the rest.[^src-fiberset]
- `FiberMap` owns keyed per-entity fibers: running a new fiber under an
  existing key replaces the previous one, and scope close interrupts them
  all.[^src-fibermap]
- `FiberHandle` owns a single replaceable background fiber — running a new
  fiber interrupts the current one unless `onlyIfMissing` is set — the right
  shape for reconnect or refresh loops.[^src-fiberhandle] [^applied-dfx]
- Use the module's `makeRuntime` when a non-Effect callback must spawn fibers
  that remain owned by the scope.[^applied-opencode]

## Keep cancellation sound

- Keep blocking or callback adapters cancellation-aware so interruption
  reaches the actual work, not just the waiting fiber.
- An interrupted child must still release what it acquired; scoped
  acquisition, finalizers, and uninterruptible-region policy are owned by
  [Resource safety](resource-safety.md).
- Avoid fire-and-forget effects and accidental fan-out over unbounded inputs.

## Supervise shutdown

- On shutdown, stop admitting work, signal owned producers, await the accepted
  drain window, then interrupt remaining child fibers and release resources.
- Acquire listeners, queues, workers, and connections in scopes the graph
  owns, so parent interruption cannot leak them.
- Observe every detached fiber's failure through supervision or explicit
  logging.

## Review checklist

- Parent, scope, or explicit supervisor owns every child fiber, including
  dynamically spawned ones.
- Sibling failure, result accumulation, ordering, and race-loss behavior are
  explicit.
- Cancellation reaches adapters, and interrupted children release scoped
  resources.
- Every background or detached fiber has a failure observer.
- Shutdown has a defined admission, drain, interrupt, and observation
  sequence.

[^src-effect]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.110` — `forkChild`, `forkIn`, `forkScoped`, `forkDetach`; `raceFirst` "The losing effect is interrupted"; `timeout` "If the timeout wins, the source effect is interrupted"; `Effect.all` `mode: "result"` and `Effect.partition`.

[^docs-run-main]: `ai-docs/src/01_effect/06_running/10_run-main.ts` at `effect@4.0.0-rc.110`.

[^src-fiberset]: `packages/effect/src/FiberSet.ts` at `effect@4.0.0-rc.110`.

[^src-fibermap]: `packages/effect/src/FiberMap.ts` at `effect@4.0.0-rc.110`.

[^src-fiberhandle]: `packages/effect/src/FiberHandle.ts` at `effect@4.0.0-rc.110`.

[^applied-dfx]: Observed in dfx@23988a4 `src/DiscordGateway/Shard.ts` (effect 4.0.0-beta.105) — heartbeat loop under `forkScoped`, reconnect fiber in a `FiberHandle` cleared on resume and re-run on Hello.

[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/session/run-coordinator.ts` (effect 4.0.0-beta.83) — `FiberSet.makeRuntime` forking drain fibers whose exits are settled explicitly.

[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-browser/src/internal/leadership.ts` (effect 4.0.0-beta.103) — lock acquisition raced against a steal signal with `raceFirst`, retry loop under `forkScoped`.
