---
type: Guide
title: Iteration
description: Choosing traversal, combination, loop, and Schedule primitives and the concurrency bound each traversal deserves; use when replacing async loops, polling, retries, or manual accumulators.
tags:
  [
    effect,
    effect-v4,
    iteration,
    foreach,
    all,
    whileloop,
    schedule,
    retry,
    repeat,
    traversal,
    concurrency-bound,
  ]
status: stable
sources:
  - id: src-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Effect.ts
    title: Effect module source — forEach, all, whileLoop, retry, repeat, discard (effect 4.0.0-rc.111)
  - id: src-types
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Types.ts
    title: Types module source — Concurrency as number or "unbounded" (effect 4.0.0-rc.111)
  - id: docs-schedule
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/06_schedule/10_schedules.ts
    title: Official Effect docs — composed retry/repeat schedules with backoff, cap, jitter (effect 4.0.0-rc.111)
  - id: docs-streams
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/03_stream/10_creating-streams.ts
    title: Official Effect docs — Stream for lazy or unbounded production (effect 4.0.0-rc.111)
  - id: test-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/Effect.test.ts
    title: Effect tests — forEach sequential default, numeric and unbounded concurrency (effect 4.0.0-rc.111)
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/git.ts
    title: opencode@2cba7e2 — capacity-bounded forEach with per-item failures kept as data
  - id: applied-opencode-polling
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/models-dev.ts
    title: opencode@2cba7e2 — polling as Effect.repeat with Schedule.spaced
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/DiscordGateway/DiscordWS.ts
    title: dfx@23988a4 — retry with a typed while predicate and Schedule-composed capped backoff
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-browser/src/MultiTab.ts
    title: effect-local@faa52d9 — forEach discard under a Semaphore permit shared across call sites
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-iteration/src/SKILL.md
    title: effect-v4-iteration skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:20:34Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Iteration

Choose by effectfulness, shape, cardinality, and time semantics.

**Applies when** replacing `Promise.all`, async loops, polling, retries, manual
accumulators, or unbounded per-item effects, and when deciding among `forEach`,
`all`, `whileLoop`, `repeat`, and `Stream`.

**Leave alone** pure synchronous transformations already clear with ordinary
collection code.

Related: [Structured concurrency](structured-concurrency.md) for
sibling-failure, race, and interruption semantics, [Streams](streams.md) when
production is lazy or unbounded, [Error modeling](error-modeling.md) for what
is safe to retry, [Async coordination](async-coordination.md) for choosing
coordination primitives.

## Choose the operation

- Use ordinary collection operations or a plain loop for pure synchronous work.
- Use `Effect.forEach` for one effectful operation per element. It preserves
  typed failures, short-circuits on the first failure, and is sequential
  unless concurrency is explicitly requested.[^src-effect]
- Use `Effect.all` for a fixed tuple, struct, or collection of already-built
  effects. It preserves tuple/struct result shape.[^src-effect]
- There is no `Effect.iterate` or `Effect.loop` in v4. Model a
  condition-driven loop with `Effect.whileLoop({ while, body, step })`, write
  explicit state machines with `Effect.gen` plus an ordinary loop or
  recursion, and unfold pure successive values with
  `Stream.iterate`.[^src-effect]
- Use `Schedule` with retry or repeat for temporal policies, including
  polling.[^docs-schedule] [^applied-opencode-polling] Use `Stream` for lazy,
  unbounded, resource-scoped, or backpressured production of
  values.[^docs-streams]

```ts
import { Effect } from "effect";

const results = Effect.forEach(inputs, processOne, {
  concurrency: 8,
});

const pair = Effect.all(
  { profile: loadProfile, settings: loadSettings },
  {
    concurrency: "unbounded",
  },
);
```

## Make execution policy visible

- Concurrency is opt-in and is a number or `"unbounded"`.[^src-types] Choose a
  numeric bound from downstream capacity; reserve `"unbounded"` for a
  genuinely small, fixed set.[^test-effect] [^applied-opencode]
- Use `{ discard: true }` when only effects matter and result collection would
  allocate useless output.[^src-effect]
- Decide whether failure short-circuits, is accumulated, or becomes per-item
  data. Do not recover broadly merely to keep a loop running.[^applied-opencode]
- Keep retries bounded and conditional on typed retryable failures — defects
  and interruption are not retried. Separate attempt count, delay/backoff,
  jitter, and overall timeout.[^src-effect] [^applied-dfx]
- Preserve interruption. Do not wrap traversal in detached promises or swallow
  cancellation while waiting between attempts.

## Avoid manual machinery

- Do not use `Promise.all` inside an Effect program.
- Replace `for` + `yield*` + `push` with `Effect.forEach` unless the loop has
  genuinely complex early-exit or state-transition behavior.
- Do not implement polling with recursive sleep flags; model it with repeat,
  retry, Schedule, or Stream according to the result
  contract.[^applied-opencode-polling]
- A traversal option is enough when one traversal owns the limit; use a
  Semaphore only when the limit is shared across call
  sites.[^applied-effect-local] [Async coordination](async-coordination.md)
  owns the Semaphore primitive itself.

## Review checklist

- Pure work stays pure; effectful work stays in the Effect channel.
- Sequential versus concurrent execution is explicit.
- Parallelism is bounded by an identified capacity.
- Failure, retry, timeout, and interruption semantics are intentional.
- The selected primitive exists in v4 and preserves the required result shape
  and cardinality.

[^src-effect]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.111` — `forEach` ("By default, the operations are performed sequentially", short-circuit, `discard`), `Effect.all` shape preservation and `mode: "result"`, `whileLoop`, `retry` ("Defects and interruptions are not retried"), `repeat`; no `iterate` or `loop` export. `Stream.iterate`: `packages/effect/src/Stream.ts`.

[^src-types]: `packages/effect/src/Types.ts` at `effect@4.0.0-rc.111` — `Concurrency = number | "unbounded"`.

[^docs-schedule]: `ai-docs/src/06_schedule/10_schedules.ts` at `effect@4.0.0-rc.111`.

[^docs-streams]: `ai-docs/src/03_stream/10_creating-streams.ts` at `effect@4.0.0-rc.111`.

[^test-effect]: `packages/effect/test/Effect.test.ts` at `effect@4.0.0-rc.111` — forEach sequential default and bounded/unbounded concurrency behavior.

[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/git.ts` (effect 4.0.0-beta.83) — `Effect.all` at `concurrency: 2` for a fixed pair, `forEach` at `concurrency: 8` for a variable file list, per-item stat failures converted to data.

[^applied-opencode-polling]: Observed in opencode@2cba7e2 `packages/core/src/models-dev.ts` (effect 4.0.0-beta.83) — refresh piped through `Effect.repeat(Schedule.spaced("60 minutes"))`.

[^applied-dfx]: Observed in dfx@23988a4 `src/DiscordGateway/DiscordWS.ts` (effect 4.0.0-beta.105) — `Effect.retry({ while })` on a typed close error, reconnects under `Schedule.min([Schedule.exponential(500), Schedule.spaced(10000)])`.

[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-browser/src/MultiTab.ts` (effect 4.0.0-beta.103) — `Effect.forEach(..., { discard: true })` release traversal guarded by a shared Semaphore permit.
