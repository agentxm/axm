---
type: Guide
title: Error modeling
description: Keeping expected failure, defects, and interruption distinct; use for throws, `catch (unknown)`, stringified failures, broad recovery, or indiscriminate retry.
tags: [effect, effect-v4, errors, failure, defects, interruption, retry, tagged-errors, reasons]
status: stable
sources:
  - id: docs-error-handling
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/04_errors/01_error-handling.ts
    title: Official Effect docs — defining and recovering typed errors (effect 4.0.0-rc.110)
  - id: docs-reason-errors
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/04_errors/20_reason-errors.ts
    title: Official Effect docs — reason-structured errors (effect 4.0.0-rc.110)
  - id: src-data
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Data.ts
    title: Data module source — Data.TaggedError (effect 4.0.0-rc.110)
  - id: src-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Schema.ts
    title: Schema module source — Schema.TaggedError, Schema.Defect (effect 4.0.0-rc.110)
  - id: src-cause
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Cause.ts
    title: Cause module source — Fail, Die, Interrupt (effect 4.0.0-rc.110)
  - id: applied-dfx
    resource: https://github.com/tim-smart/dfx/blob/23988a4f182eb5cebc6c3bbac3f3c35fd303168f/src/Interactions/webhook.ts
    title: dfx@23988a4 — typed error unions at a published API boundary
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/67022d69a8f6070bc938e7a38aaa64a8062f8488/packages/alchemy/src/Auth/AuthProvider.ts
    title: alchemy@67022d6 — Schema.TaggedError with a Schema.Defect cause field
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/fs-util.ts
    title: opencode@2cba7e2 — reason-narrow recovery with Effect.catchReason
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-error-modeling/src/SKILL.md
    title: effect-v4-error-modeling skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:10:36Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
---

# Error modeling

Keep expected failure, defects, and interruption semantically distinct.

**Applies when** code throws, catches `unknown`, collapses failures into
strings, recovers broadly, retries indiscriminately, or mixes expected failures
with defects or interruption — even without an existing Effect error channel.

**Leave alone** impossible internal states that should remain defects, and
straightforward propagation of errors already normalized at a sound boundary.

Related: [Wrapping](wrapping.md) for translating foreign failures at the
boundary, [Iteration](iteration.md) for bounded retry schedules, [Resource
safety](resource-safety.md) for interruption during cleanup, [HTTP
API](http-api.md) for projecting failures onto HTTP responses.

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
  rc.110 `catchTag` also accepts an array of tags. A broad catch must re-fail
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
- Retry and observability policy are bounded, safe, and non-duplicative.

[^src-cause]: `packages/effect/src/Cause.ts` at `effect@4.0.0-rc.110` — failure, defect, and interruption as distinct `Reason` cases.
[^src-schema]: `Data.TaggedError`: `packages/effect/src/Data.ts`; `Schema.TaggedError` and `Schema.Defect`: `packages/effect/src/Schema.ts`, all at `effect@4.0.0-rc.110`.
[^docs-error-handling]: `ai-docs/src/01_effect/04_errors/01_error-handling.ts` at `effect@4.0.0-rc.110`.
[^docs-reason-errors]: `ai-docs/src/01_effect/04_errors/20_reason-errors.ts` at `effect@4.0.0-rc.110`.
[^applied-alchemy]: Observed in alchemy@67022d6 `packages/alchemy/src/Auth/AuthProvider.ts` (effect peer `>=4.0.0-beta.105`).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/fs-util.ts` (effect 4.0.0-beta.83).
