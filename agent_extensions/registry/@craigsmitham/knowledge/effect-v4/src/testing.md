---
type: Checklist
title: Testing
description: Evaluate whether Effect programs are tested deterministically through public services, controlled runtime inputs, and complete lifetime behavior.
tags: [effect, effect-v4, testing, vitest, testclock, layers, determinism]
status: stable
sources:
  - id: effect-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/09_testing/10_effect-tests.ts
    title: Effect 4.0.0-rc.115 Effect tests
  - id: effect-layer-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/09_testing/20_layer-tests.ts
    title: Effect 4.0.0-rc.115 layer tests
  - id: effect-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/testing/TestClock.ts
    title: Effect 4.0.0-rc.115 TestClock source
  - id: effect-arbitrary
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/ARBITRARY.md
    title: Effect 4.0.0-rc.115 native Arbitrary guide
  - id: effect-arbitrary-migration
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/ARBITRARY-MIGRATION.md
    title: Effect 4.0.0-rc.115 native Arbitrary migration
generated: { by: codex/gpt-6, at: 2026-09-11T17:32:03Z }
---

# Testing

- [ ] Run Effect assertions with `@effect/vitest` Effect-aware test functions
  so typed failures, interruption, and test services are handled correctly.
- [ ] Substitute dependencies through the same service tags used in production
  rather than mocking private functions or module internals.
- [ ] Control time with `TestClock` for sleeps, retries, schedules, and
  deadlines; use live time only when the test explicitly requires it.
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

- [Effect tests](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/09_testing/10_effect-tests.ts)
- [Layer tests](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/ai-docs/src/09_testing/20_layer-tests.ts)
- [TestClock source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/src/testing/TestClock.ts)
- [Native property testing](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/ARBITRARY.md)
- [Migration from the fast-check bridge](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.115/packages/effect/ARBITRARY-MIGRATION.md)

[^effect-arbitrary-migration]: Effect native Arbitrary migration.
[^effect-arbitrary]: Effect native property testing guide.
