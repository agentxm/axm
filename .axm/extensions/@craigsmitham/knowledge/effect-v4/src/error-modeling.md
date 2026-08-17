---
type: Guide
title: Error modeling
description: Keeping expected failure, defects, and interruption distinct; use for throws, `catch (unknown)`, stringified failures, broad recovery, or indiscriminate retry.
tags: [effect, effect-v4, errors, failure, defects, interruption, retry, tagged-errors]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-error-modeling/src/SKILL.md
    title: effect-v4-error-modeling skill 0.1.0 (retired into this bundle)
  - id: effect-rc110-schema
    resource: https://github.com/Effect-TS/effect/blob/66114151c2b4640bf773f2b3456ce70d679422f6/packages/effect/src/Schema.ts
    title: Effect 4.0.0-rc.110 Schema source
generated:
  by: openai/gpt-5
  at: 2026-08-17T13:54:16Z
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
safety](resource-safety.md) for interruption during cleanup.

## Classify first

- Put anticipated, actionable failures in the typed error channel.
- Use small tagged errors with the context a caller needs to decide, recover, report, or retry.
- Treat violated invariants and programmer mistakes as defects.
- Treat interruption as lifecycle control flow, not a business error.

Do not expose raw `unknown`, third-party exceptions, or transport errors beyond their ownership boundary. Translate them once while preserving useful cause or metadata.

## Recover deliberately

- Recover by tag at the layer that owns the fallback decision.
- Catch a full `Cause` only when the code truly handles failures, defects, and interruption.
- Preserve unhandled cases; do not turn every failure into a default value.
- Retry only failures known to be transient, with an explicit schedule and termination policy.
- Convert to defects with `orDie` only when failure is genuinely impossible after composition.

## Design the public channel

- Prefer domain meaning over implementation detail: `CustomerNotFound` is more useful than a database driver's exception.
- Keep variants discriminable and payloads stable.
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

class NotFoundResponse extends Schema.TaggedError<NotFoundResponse>()(
  "NotFoundResponse",
  { resource: Schema.String },
  { httpApiStatus: 404 },
) {}
```

- Use `Data.TaggedError` for in-process domain failures and
  `Schema.TaggedError` when the failure itself crosses a schema boundary.
- Make fields readonly and decision-relevant. A tagged error is data, not a
  service object; put recovery logic beside the owning operation.
- Yield tagged errors directly inside `Effect.gen` or fail explicitly when that
  makes the boundary clearer.
- As of `4.0.0-rc.110` the Schema constructor is `Schema.TaggedError`, not the
  removed `Schema.TaggedErrorClass` name.

## Narrow and observe

- Prefer `catchTag`/`catchTags` when only named variants are handled. A broad
  catch must re-fail every case it does not own.
- Use `Effect.flip` in tests when asserting typed failures as values.
- Log or trace at the handling boundary where context and disposition are
  known; avoid logging the same failure at every propagation layer.
- Derive retry eligibility from the typed failure and combine a bounded
  Schedule with a total timeout. Never retry defects, interruption, or unknown
  writes by default.

## Review checklist

- Each expected failure has one stable tag and useful readonly context.
- Foreign `unknown` is translated once at its owning boundary.
- Recovery is tag-narrow and leaves unhandled failures in the channel.
- Defects and interruption have not been converted to ordinary domain errors.
- Retry and observability policy are bounded, safe, and non-duplicative.
