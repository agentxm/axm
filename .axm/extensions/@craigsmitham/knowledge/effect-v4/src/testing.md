---
type: Guide
title: Testing
description: Building deterministic tests for programs and their lifetimes; use for real-time sleeps, mocked internals, leaked fibers, or nondeterminism through time, scheduling, or randomness.
tags: [effect, effect-v4, testing, testclock, vitest, determinism, fakes, layers, flakiness]
status: stable
sources:
  - id: docs-effect-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/09_testing/10_effect-tests.ts
    title: Official Effect docs — it.effect, it.live, each/prop, and the TestClock pattern (effect 4.0.0-rc.110)
  - id: docs-layer-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/09_testing/20_layer-tests.ts
    title: Official Effect docs — suite-shared layers and Ref-backed test fakes (effect 4.0.0-rc.110)
  - id: src-vitest
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/vitest/src/index.ts
    title: "@effect/vitest source — the complete tester surface: effect, live, layer, prop, flakyTest (4.0.0-rc.110)"
  - id: src-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/testing/TestClock.ts
    title: TestClock source — adjust and setTime under effect/testing (effect 4.0.0-rc.110)
  - id: test-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/test/TestClock.test.ts
    title: TestClock tests — fork the waiting effect, adjust, then assert (effect 4.0.0-rc.110)
  - id: src-random
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Random.ts
    title: Random module source — Random.withSeed for deterministic randomness (effect 4.0.0-rc.110)
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-rpc/test/SyncClient.test.ts
    title: effect-local@faa52d9 — fake at the real service key, Deferred coordination, TestClock boundary pinning
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/test/lib/effect.ts
    title: opencode@2cba7e2 — bun:test harness built from effect/testing (TestClock, TestConsole)
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-testing/src/SKILL.md
    title: effect-v4-testing skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:19:49Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:49Z
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

- Supply test implementations through layers at the program boundary
  ([Services and layers](services-and-layers.md) owns designing the
  substitutable boundary).
- Prefer small fakes that model capability behavior over mocks coupled to call order.
- Capture console, clock, and other environmental behavior with their test
  services under `effect/testing`.
- Seed randomness through `Random.withSeed` when outcomes depend on random
  values; rc.110 has no TestRandom service.[^src-random]
- Keep one clear runtime boundary per test instead of scattering `runPromise`.

## Make time deterministic

- Never wait on wall-clock sleeps; coordinate readiness with `Deferred` or
  `Ref` signals instead.
- Fork the program that waits, advance `TestClock`, then join and
  assert.[^test-testclock]
- Exercise schedules, retries, timeout boundaries, and cancellation with
  virtual time — advance to just before and just past the boundary and assert
  at each step.[^applied-effect-local]
- Ensure background fibers are supervised and complete or are interrupted before the test ends.

## Assert semantics

- Assert successes, typed failures, defects, interruption, and finalization according to the contract.
- Test resource release on both failure and cancellation.
- Test concurrency outcomes without depending on incidental scheduling order.
- Use schema/property generation (`it.effect.prop` with Schema arbitraries)
  when invariants span a broad input space.[^docs-effect-tests]
- Keep integration tests for real adapters, but retain deterministic core tests through service substitution.

Flakiness is usually evidence of an uncontrolled dependency or lifetime, not something to fix with longer delays.

## Use the Effect test runtime

```ts
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

describe("lookup", () => {
  it.effect("returns a typed failure", () =>
    Effect.gen(function* () {
      const error = yield* lookup(missingId).pipe(Effect.flip);
      assert.strictEqual(error._tag, "UserNotFound");
    }).pipe(Effect.provide(TestUsers)),
  );
});
```

- Use `it.effect` for ordinary Effect tests and `it.live` when the real clock
  and services are required; both already provide `Scope` to the test body.
  There is no Effect `it.scoped` tester in rc.110 — `it.scoped` resolves to
  vitest's own fixture API and rejects an Effect test function.[^src-vitest]
- Use `it.layer` to share an expensive suite-owned layer with the lifecycle
  the suite declares.[^docs-layer-tests]
- Provide dependencies through Layers; do not call `runPromise` inside Effect
  tests or mock private implementation functions.
- Assert typed errors with `Effect.flip` or another typed channel operation.
  Test defects and interruption separately when they are part of the contract.
- Advance `TestClock` only after the waiting fiber is started, then join it and
  verify completion/finalization.[^src-testclock]
- `@effect/vitest` is the default harness, not a requirement: under another
  runner, compose `TestClock.layer()` and `TestConsole.layer` from
  `effect/testing` and keep the same one-boundary
  discipline.[^applied-opencode]

## Review checklist

- Effect tests use `@effect/vitest` by default — or a harness built on
  `effect/testing` — and keep one runtime boundary.
- Required services are provided through contract-compatible test layers.
- Time, randomness, logging, and concurrency are deterministic where relevant.
- Resource tests cover success, failure, and interruption cleanup.
- Shared suite layers have explicit ownership and do not leak mutable state
  between tests.

[^src-vitest]: `packages/vitest/src/index.ts` at `effect@4.0.0-rc.110` — exported testers are `effect`, `live`, `layer`, `prop`, and `flakyTest`; the internal tester wraps every `it.effect`/`it.live` body in `Effect.scoped`.

[^docs-effect-tests]: `ai-docs/src/09_testing/10_effect-tests.ts` at `effect@4.0.0-rc.110`.

[^docs-layer-tests]: `ai-docs/src/09_testing/20_layer-tests.ts` at `effect@4.0.0-rc.110`.

[^src-testclock]: `packages/effect/src/testing/TestClock.ts` at `effect@4.0.0-rc.110` — `adjust`, `setTime`.

[^test-testclock]: `packages/effect/test/TestClock.test.ts` at `effect@4.0.0-rc.110` — fork the waiting effect, adjust, then assert.

[^src-random]: `packages/effect/src/Random.ts` at `effect@4.0.0-rc.110` — `Random.withSeed`; `effect/testing` contains no TestRandom service.

[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-rpc/test/SyncClient.test.ts` (effect 4.0.0-beta.103) — retry boundaries pinned by adjusting to 4999 ms then 1 ms more.

[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/test/lib/effect.ts` (effect 4.0.0-beta.83).
