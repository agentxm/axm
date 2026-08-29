---
type: Checklist
title: Testing
description: Evaluate whether Effect programs are tested deterministically through public services, controlled runtime inputs, and complete lifetime behavior.
tags: [effect, effect-v4, testing, vitest, testclock, layers, determinism]
status: stable
sources:
  - id: effect-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/09_testing/10_effect-tests.ts
    title: Effect 4.0.0-rc.112 Effect tests
  - id: effect-layer-tests
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/09_testing/20_layer-tests.ts
    title: Effect 4.0.0-rc.112 layer tests
  - id: effect-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/testing/TestClock.ts
    title: Effect 4.0.0-rc.112 TestClock source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Testing

- [ ] Run Effect assertions with `@effect/vitest` Effect-aware test functions
  so typed failures, interruption, and test services are handled correctly.
- [ ] Substitute dependencies through the same service tags used in production
  rather than mocking private functions or module internals.
- [ ] Control time with `TestClock` for sleeps, retries, schedules, and
  deadlines; use live time only when the test explicitly requires it.
- [ ] Seed or replace randomness and other nondeterministic inputs so failures
  can be reproduced.
- [ ] Exercise resource acquisition and finalization under success, expected
  failure, defect, and interruption.
- [ ] Keep mutable test state scoped to one test or test layer and prevent
  background fibers from leaking across cases.
- [ ] Assert public domain results, observable calls, and lifetime guarantees
  rather than incidental layer composition or implementation order.
- [ ] Include boundary-focused property or table tests for schemas, error
  translation, concurrency limits, and other invariants with broad input space.

## Resources

- [Effect tests](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/09_testing/10_effect-tests.ts)
- [Layer tests](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/09_testing/20_layer-tests.ts)
- [TestClock source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/testing/TestClock.ts)
