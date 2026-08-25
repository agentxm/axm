---
type: Guide
title: Error modeling
description: Keeping expected failure, defects, and interruption distinct; use for throws, `catch (unknown)`, stringified failures, broad recovery, indiscriminate retry, or a `Result` used as an error channel.
tags: [effect, effect-v4, errors, failure, defects, interruption, retry, tagged-errors, reasons, result]
status: stable
sources:
  - id: docs-error-handling
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/04_errors/01_error-handling.ts
    title: Official Effect docs — defining and recovering typed errors (effect 4.0.0-rc.111)
  - id: docs-reason-errors
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/04_errors/20_reason-errors.ts
    title: Official Effect docs — reason-structured errors (effect 4.0.0-rc.111)
  - id: src-data
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Data.ts
    title: Data module source — Data.TaggedError (effect 4.0.0-rc.111)
  - id: src-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Schema.ts
    title: Schema module source — Schema.TaggedError, Schema.Defect, decodeResult throwing on non-schema causes (effect 4.0.0-rc.111)
  - id: src-cause
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Cause.ts
    title: Cause module source — Fail, Die, Interrupt (effect 4.0.0-rc.111)
  - id: src-result
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Result.ts
    title: Result module source — Result<A, E = never> success-first, .success/.failure, isSuccess/isFailure (effect 4.0.0-rc.111)
  - id: src-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Effect.ts
    title: Effect module source — Effect.result gotcha and Effect.exit as the full-fidelity alternative (effect 4.0.0-rc.111)
  - id: src-stream
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Stream.ts
    title: Stream module source — Stream.result and Result-keyed partitioning as per-element outcomes (effect 4.0.0-rc.111)
  - id: applied-alchemy-consume
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Cloudflare/Workers/Fetch.ts
    title: alchemy-effect@1596e50 — Result from a non-Effect helper branched back into the Effect channel in place
  - id: applied-alchemy-globals
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/cloudflare-runtime/src/core/globals/Globals.ts
    title: alchemy-effect@1596e50 — Cron.parse Result converted to a typed ConfigError in the same expression
  - id: applied-opencode-cursor
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/protocol/src/groups/session.ts
    title: opencode@65c3597 — decode Result consumed inside Effect.suspend and never returned from the API
  - id: applied-dfx-no-result
    resource: https://github.com/tim-smart/dfx/tree/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src
    title: dfx@23988a4 — published Effect and Layer surface with zero uses of the Result module (negative evidence)
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/Interactions/webhook.ts
    title: dfx@23988a4 — typed error unions at a published API boundary
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/67022d69a8f6070bc938e7a38aaa64a8062f8488/packages/alchemy/src/Auth/AuthProvider.ts
    title: alchemy@67022d6 — Schema.TaggedError with a Schema.Defect cause field
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/fs-util.ts
    title: opencode@2cba7e2 — reason-narrow recovery with Effect.catchReason
  - id: api-effect-v4
    resource: https://www.effect.website/docs/v4/api
    title: Effect v4 API reference — browsable Effect, Result, and Cause module surfaces
    author: team:effect
    last_modified: 2026-08-17
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-error-modeling/src/SKILL.md
    title: effect-v4-error-modeling skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
  - by: claude/opus-5
    at: 2026-08-17T22:10:00Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Error modeling

Keep expected failure, defects, and interruption semantically distinct.

**Applies when** code throws, catches `unknown`, collapses failures into
strings, recovers broadly, retries indiscriminately, or mixes expected failures
with defects or interruption — even without an existing Effect error channel.

**Leave alone** impossible internal states that should remain defects, and
straightforward propagation of errors already normalized at a sound boundary.

Related: [Wrapping](wrapping.md) for translating foreign failures at the
boundary and for what crosses back out to a non-Effect caller, [Services and
layers](services-and-layers.md) for exhausting the channel before a runner,
[Iteration](iteration.md) for bounded retry schedules, [Resource
safety](resource-safety.md) for interruption during cleanup, [HTTP
API](http-api.md) for projecting failures onto HTTP responses, and the [Effect
v4 API reference](https://www.effect.website/docs/v4/api) for browsing the
`Effect`, `Result`, and `Cause` surfaces.

## Classify first

- Put anticipated, actionable failures in the typed error channel.
- Use small tagged errors with the context a caller needs to decide, recover, report, or retry.
- Treat violated invariants and programmer mistakes as defects.
- Treat interruption as lifecycle control flow, not a business error.[^src-cause]

Do not expose raw `unknown`, third-party exceptions, or transport errors beyond their ownership boundary. Translate them once while preserving useful cause or metadata.

## Recover deliberately

- Recover by tag at the layer that owns the fallback decision.
- Catch a full `Cause` only when the code truly handles failures, defects, and interruption.
- Preserve unhandled cases; do not turn every failure into a default value.
- Retry only failures known to be transient, with an explicit schedule and termination policy.
- Convert to defects with `orDie` only when failure is genuinely impossible after composition.

## Design the public channel

- Prefer domain meaning over implementation detail: `CustomerNotFound` is more useful than a database driver's exception.
- Keep variants discriminable and payloads stable. When one tag covers several
  causes a caller handles differently, give it a tagged `reason` field rather
  than multiplying top-level variants.[^docs-reason-errors]
- Map errors at subsystem boundaries rather than repeatedly throughout business logic.
- Test typed failure, defect, and interruption paths separately when each matters.

Avoid a single catch-all application error that removes the distinctions Effect can enforce.

## Use `Result` as data, not as a hidden error channel

rc.111 has no `Either` module. `Result<A, E = never>` is success-first, its
members are `.success`/`.failure`, and its guards are
`Result.isSuccess`/`isFailure`.[^src-result]

- `Effect.result` captures only typed, recoverable failure. Defects and
  interruption remain failures of the surrounding effect, so a `Result` is
  lossier only when it is presented as a substitute for the full Effect
  outcome.[^src-effect]
- Keep service, Layer, and handler operations in `Effect<A, E, R>` by default
  when both sides are Effect-owned and the caller still needs execution,
  cancellation, environment, or recovery semantics. Do not add a nested
  `Result` merely to make `E = never`.
- Use `Result` deliberately when success and expected failure are themselves
  values: an already-computed pure result, a per-item or aggregate outcome, or
  a boundary contract that explicitly carries recoverable business failure as
  data. `Effect.all(..., { mode: "result" })` and `Stream.result` are first-party
  examples; defects and interruption still remain outside those values.
  [^src-effect] [^src-stream]
- When a non-Effect helper returns `Result`, re-enter the Effect channel where
  the owning API promises Effect failure semantics. Several applied boundaries
  consume the value locally and return a typed Effect, but that evidence is a
  pattern, not a prohibition on every Result-returning API.
  [^applied-alchemy-consume] [^applied-alchemy-globals]
  [^applied-opencode-cursor] [^applied-dfx-no-result]
- Even the schema layer refuses to smuggle a defect through one:
  `Schema.decodeResult` returns `Result.fail` only for causes made entirely of
  schema issues, and **throws** on causes containing defects or
  interruption.[^src-schema]

When the far side is genuinely outside Effect, choose the outbound shape from
that contract's required fidelity: a domain value, a `Result` carrying only
expected failure, or `Effect.exit` when defects and interruption must be
preserved. [Wrapping](wrapping.md) owns that crossing.

## Encode failures with the right base

```ts
import { Data, Effect, Schema } from "effect"

class StorageUnavailable extends Data.TaggedError("StorageUnavailable")<{
  readonly operation: string
  readonly cause: unknown
}> {}

class ImportFailed extends Schema.TaggedError<ImportFailed>()(
  "ImportFailed",
  {
    source: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
```

- Use `Data.TaggedError` for in-process domain failures and
  `Schema.TaggedError` when the failure itself crosses a schema
  boundary.[^src-schema]
- Carry a foreign cause on a schema-backed error with a
  `Schema.Defect()` field, not a stringified message.[^applied-alchemy]
- Make fields readonly and decision-relevant. A tagged error is data, not a
  service object; put recovery logic beside the owning operation.
- Yield tagged errors directly inside `Effect.gen` or fail explicitly when that
  makes the boundary clearer.
- HTTP status projection (`httpApiStatus` and friends) belongs to the API
  contract; see [HTTP API](http-api.md).

## Narrow and observe

- Prefer `catchTag`/`catchTags` when only named variants are handled; in
  rc.111 `catchTag` also accepts an array of tags. A broad catch must re-fail
  every case it does not own.[^docs-error-handling]
- When a foreign module exposes reason-structured errors — such as
  `PlatformError` — recover the specific reasons with
  `Effect.catchReason`/`catchReasons` instead of re-wrapping the whole
  error.[^docs-reason-errors] [^applied-opencode]
- Use `Effect.flip` in tests when asserting typed failures as values.
- Log or trace at the handling boundary where context and disposition are
  known ([Observability](observability.md) owns the log-once rule).
- Derive retry eligibility from the typed failure and combine a bounded
  Schedule with a total timeout. Never retry defects, interruption, or unknown
  writes by default.

## Review checklist

- Each expected failure has one stable tag and useful readonly context.
- Foreign `unknown` is translated once at its owning boundary.
- Recovery is tag-narrow or reason-narrow and leaves unhandled failures in the
  channel.
- Defects and interruption have not been converted to ordinary domain errors.
- No `Result` appears in a service, Layer, or handler signature between
  Effect-owned modules; every `Result` from a non-Effect helper is consumed in
  place, and the only surviving ones are per-element `Stream`/`Queue` payloads.
- Retry and observability policy are bounded, safe, and non-duplicative.

[^src-cause]: `packages/effect/src/Cause.ts` at `effect@4.0.0-rc.111` — failure, defect, and interruption as distinct `Reason` cases.
[^src-schema]: `Data.TaggedError`: `packages/effect/src/Data.ts`; `Schema.TaggedError` and `Schema.Defect`: `packages/effect/src/Schema.ts`, all at `effect@4.0.0-rc.111`. `Schema.decodeResult` (`Schema.ts:1787-1797`) documents that "only causes made entirely of schema issues are returned as `Result.fail`. Causes that contain defects, interruptions, or other non-schema reasons throw instead."
[^src-result]: `packages/effect/src/Result.ts` at `effect@4.0.0-rc.111` — `export type Result<A, E = never> = Success<A, E> | Failure<A, E>` (:66); success-first parameters, `.success`/`.failure` members, `isSuccess`/`isFailure` guards, `succeed`/`fail` constructors. No `Either.ts` exists in `packages/effect/src`.
[^src-effect]: `packages/effect/src/Effect.ts` at `effect@4.0.0-rc.111` — `result` returns `Effect<Result<A, E>, never, R>` and documents that defects and interruptions remain outside the `Result`; `exit` is the full-fidelity alternative; `all` with `mode: "result"` runs every effect and collects a same-shaped `Result` for each typed success or failure.
[^src-stream]: `packages/effect/src/Stream.ts` at `effect@4.0.0-rc.111` — `result` (:1979) is `Stream<A, E, R> => Stream<Result<A, E>, never, R>`, implemented as `map(Result.succeed)` plus `catch_((e) => succeed(Result.fail(e)))`; `partitionEffect` (:4316) builds on `partitionQueue<Result<Pass, Fail>, …>` (:4361) to route per-element outcomes.
[^applied-alchemy-consume]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Cloudflare/Workers/Fetch.ts` (effect 4.0.0-rc.110) — `Url.make` returns a `Result`; `Result.isFailure(urlResult)` (:84) returns `Effect.fail(new HttpClientError.InvalidUrlError({ cause: urlResult.failure }))` and the success path reads `urlResult.success` (:93). The published signature is `Effect<HttpClientResponse, RequestError>`.
[^applied-alchemy-globals]: Observed in alchemy-effect@1596e50 `packages/cloudflare-runtime/src/core/globals/Globals.ts` (effect 4.0.0-rc.110) — `Result.isSuccess(Cron.parse(expression, "UTC"))` (:141) selects between `Effect.succeed` and `Effect.fail(new ConfigError(...))` inline, so a typo becomes a config-time failure rather than a dead timer.
[^applied-opencode-cursor]: Observed in opencode@65c3597 `packages/protocol/src/groups/session.ts` (effect 4.0.0-beta.83) — `Encoding.decodeBase64UrlString` returns a `Result`; `Result.isFailure(result)` (:74) is branched inside `Effect.suspend`, and the exported `parse` returns an Effect.
[^applied-dfx-no-result]: Observed in dfx@23988a4 `src/` (effect peer `>=4.0.0-beta.101`, dev `4.0.0-beta.105`) — a published library exporting Effect-returning operations and Layers; the only matches for "Result" in the tree are generated Discord API type names (`PollResultsResponse`), and the `Result` module is never imported. Negative evidence for the signature rule.
[^docs-error-handling]: `ai-docs/src/01_effect/04_errors/01_error-handling.ts` at `effect@4.0.0-rc.111`.
[^docs-reason-errors]: `ai-docs/src/01_effect/04_errors/20_reason-errors.ts` at `effect@4.0.0-rc.111`.
[^applied-alchemy]: Observed in alchemy@67022d6 `packages/alchemy/src/Auth/AuthProvider.ts` (effect peer `>=4.0.0-beta.105`).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/fs-util.ts` (effect 4.0.0-beta.83).
