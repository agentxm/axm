---
type: Checklist
title: Testing
description: Evaluate whether Effect programs are tested deterministically through public services, controlled runtime inputs, and complete lifetime behavior.
tags: [effect, effect-v4, testing, vitest, testclock, layers, determinism]
status: stable
sources:
  - id: effect-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/09_testing/10_effect-tests.ts
    title: Effect 4.1.0 Effect tests
  - id: effect-layer-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/09_testing/20_layer-tests.ts
    title: Effect 4.1.0 layer tests
  - id: effect-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/testing/TestClock.ts
    title: Effect 4.1.0 TestClock source
  - id: effect-arbitrary
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/ARBITRARY.md
    title: Effect 4.1.0 native Arbitrary guide
  - id: effect-arbitrary-migration
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/migration/schema.md#migrating-from-the-fast-check-bridge-to-native-arbitrary
    title: Effect 4.1.0 native Arbitrary migration
  - id: applied-opencode-harness
    resource: https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/core/test/lib/effect.ts
    title: opencode Bun test harness at 432d870 (Effect 4.0.1)
  - id: applied-opencode-coordination
    resource: https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/core/test/effect/keyed-mutex.test.ts
    title: opencode keyed mutex synchronization tests at 432d870 (Effect 4.0.1)
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Testing

- [ ] Use a harness that reports failed exits, owns test scopes and fibers,
  and supplies controlled services; prefer `@effect/vitest` in Vitest
  repositories. Verify a custom harness's failure, interruption, finalization,
  and clock behavior.[^effect-tests][^applied-opencode-harness]
- [ ] Substitute dependencies through the same service tags used in production
  rather than mocking private functions or module internals; explicitly replace
  network adapters when network access is outside the test contract and fail
  unexpected access through the transports used.[^applied-opencode-harness]
- [ ] Control time with `TestClock` for sleeps, retries, schedules, and
  deadlines; use live time only when the test explicitly requires it.
- [ ] Establish worker readiness and release points with explicit signals;
  assert observable outcomes after joining or interrupting workers instead of
  guessing readiness with sleeps or depending on scheduler
  order.[^applied-opencode-coordination]
- [ ] Make nondeterministic failures reproducible through controlled inputs or
  captured seeds and replay tokens; retain important failing inputs as explicit
  regression cases across generator upgrades.[^effect-arbitrary-migration]
- [ ] Exercise resource acquisition and finalization under success, expected
  failure, defect, and interruption.
- [ ] Keep mutable test state scoped to one test or test layer and prevent
  background fibers from leaking across cases.
- [ ] Assert public domain results, observable calls, and lifetime guarantees
  rather than incidental layer composition or implementation order.
- [ ] Include boundary-focused property or table tests for schemas, error
  translation, concurrency limits, and other invariants with broad input space.
- [ ] Require property checks to pass explicitly; exhausted generation and
  replay mismatches must not count as success.[^effect-arbitrary]

## Resources

- [Crypto service substitution with Layer.mock (replaces TestCrypto)](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/CHANGELOG.md#410)

- [Effect tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/09_testing/10_effect-tests.ts)
- [Layer tests](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/09_testing/20_layer-tests.ts)
- [TestClock source](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/testing/TestClock.ts)
- [Native property testing](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/ARBITRARY.md)
- [Migration from the fast-check bridge](https://github.com/Effect-TS/effect/blob/effect%404.1.0/migration/schema.md#migrating-from-the-fast-check-bridge-to-native-arbitrary)
- [Schema test helpers](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/testing/TestSchema.ts)

[^effect-arbitrary-migration]: Effect native Arbitrary migration.
[^effect-arbitrary]: Effect native property testing guide.
[^effect-tests]: Effect-aware tests and test services.

[^applied-opencode-harness]: [opencode Bun test harness at 432d870 (Effect 4.0.1)](https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/core/test/lib/effect.ts).

[^applied-opencode-coordination]: [opencode keyed mutex synchronization tests at 432d870 (Effect 4.0.1)](https://github.com/anomalyco/opencode/blob/432d870b02683d2e40e895ddc70d437189b25276/packages/core/test/effect/keyed-mutex.test.ts).
