---
name: effect-v4-testing
description: Builds deterministic tests for Effect v4 programs and their lifetimes. Use when tests sleep in real time, mock repeated internals, depend on real services, leak fibers, or are nondeterministic through time, scheduling, randomness, or concurrency—even when Effect test utilities are not yet used. Skip pure synchronous logic already covered by straightforward value tests.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 testing

Test observable Effect behavior with controlled services and time.

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
