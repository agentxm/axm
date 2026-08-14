---
type: Guide
title: Testing
description: Building deterministic tests for programs and their lifetimes; use for real-time sleeps, mocked internals, leaked fibers, or nondeterminism through time, scheduling, or randomness.
tags: [effect, effect-v4, testing, testclock, vitest, determinism, fakes, layers, flakiness]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-testing/src/SKILL.md
    title: effect-v4-testing skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Testing

Test observable Effect behavior with controlled services and time.

**Applies when** tests sleep in real time, mock repeated internals, depend on
real services, leak fibers, or are nondeterministic through time, scheduling,
randomness, or concurrency — even when Effect test utilities are not yet used.

**Leave alone** pure synchronous logic already covered by straightforward value
tests.

Related: [Services and layers](services-and-layers.md) for substitution through
the same service key, [Resource safety](resource-safety.md) for finalization
assertions, [Structured concurrency](structured-concurrency.md) for supervising
forked test fibers.

## Control dependencies

- Supply test implementations through layers at the program boundary.
- Prefer small fakes that model capability behavior over mocks coupled to call order.
- Capture console, clock, and other environmental behavior with their test services.
- Keep one clear runtime boundary per test instead of scattering `runPromise`.

## Make time deterministic

- Never wait on wall-clock sleeps.
- Fork the program that waits, advance `TestClock`, then join and assert.
- Exercise schedules, retries, timeout boundaries, and cancellation with virtual time.
- Ensure background fibers are supervised and complete or are interrupted before the test ends.

## Assert semantics

- Assert successes, typed failures, defects, interruption, and finalization according to the contract.
- Test resource release on both failure and cancellation.
- Test concurrency outcomes without depending on incidental scheduling order.
- Use schema/property generation when invariants span a broad input space.
- Keep integration tests for real adapters, but retain deterministic core tests through service substitution.

Flakiness is usually evidence of an uncontrolled dependency or lifetime, not something to fix with longer delays.

## Use the Effect test runtime

```ts
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

describe("lookup", () => {
  it.effect("returns a typed failure", () =>
    Effect.gen(function*() {
      const error = yield* lookup(missingId).pipe(Effect.flip)
      assert.strictEqual(error._tag, "UserNotFound")
    }).pipe(Effect.provide(TestUsers)),
  )
})
```

- Use `it.effect` for ordinary Effect tests and `it.scoped` when the test body
  requires Scope. Use `it.layer` to share an expensive suite-owned layer with
  the lifecycle the suite declares.
- Provide dependencies through Layers; do not call `runPromise` inside Effect
  tests or mock private implementation functions.
- Assert typed errors with `Effect.flip` or another typed channel operation.
  Test defects and interruption separately when they are part of the contract.
- Advance `TestClock` only after the waiting fiber is started, then join it and
  verify completion/finalization.

## Review checklist

- Effect tests import from `@effect/vitest` and keep one runtime boundary.
- Required services are provided through contract-compatible test layers.
- Time, randomness, logging, and concurrency are deterministic where relevant.
- Resource tests cover success, failure, and interruption cleanup.
- Shared suite layers have explicit ownership and do not leak mutable state
  between tests.
