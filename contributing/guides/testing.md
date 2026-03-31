# Testing Guide

Testing strategy for this project: unit tests for pure functions, handler tests
with Effect test layers, and E2E tests for CLI commands. Covers test quality
principles, when to use each level, and Effect-specific patterns like injected
test seams, small fakes, and layer construction.

> [Testing](../../CLAUDE.md#testing) — workflow and quality checklist

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

## Key Resources

- [Vitest Documentation](https://vitest.dev/) — Test runner API and configuration
- [Effect Testing](https://effect.website/docs/testing) — Testing Effect programs

## Skills

| Skill                                                                           | Command | Description                                        |
| ------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| [axm-testing-e2e](../../.claude/skills/axm-testing-e2e/SKILL.md)                | —       | E2E test patterns for CLI commands                 |
| [effect-testing](../../.axm/extensions/@axm/skills/effect-testing/src/SKILL.md) | —       | Effect testing with @effect/vitest                 |
| [effect-service](../../.axm/extensions/@axm/skills/effect-service/src/SKILL.md) | —       | Service patterns including test layer construction |

---

## Test Levels

This project uses two test levels with distinct purposes:

**Unit tests** verify isolated behavior of pure functions, handlers, and business
logic. They run fast, require no external dependencies, and catch regressions in
core logic. Place unit tests alongside source files (`parser.test.ts` next to
`parser.ts`).

**Distribution E2E tests** verify the **built artifact** works correctly. They
live in separate Nx projects (`packages/<cli>-e2e/`), depend only on shared
test helpers from `packages/e2e-utils/`, and spawn the compiled output from
`dist/`. These catch build/bundle failures, missing deps, entry point wiring
issues, and platform-specific problems that unit tests cannot.

| Aspect           | Unit Tests                            | Distribution E2E                 |
| ---------------- | ------------------------------------- | -------------------------------- |
| **Scope**        | Single function or handler            | Full CLI command                 |
| **Speed**        | Milliseconds                          | Seconds                          |
| **Dependencies** | Test layers, fakes, or targeted mocks | Real file system, built artifact |
| **Location**     | Colocated with source                 | `packages/<cli>-e2e/`            |
| **Tests what**   | Logic correctness, edge cases         | Build integrity, CLI behavior    |
| **Runs**         | `pnpm test`                           | `pnpm test:e2e`                  |

---

## When to Write Tests

Tests serve as executable specifications that define desired behavior before
implementation. This project follows test-first development for most changes:

- **New features** — Write tests that describe expected behavior, then implement
- **Bug fixes** — Write a failing test that reproduces the bug, then fix it
- **Refactoring** — Ensure existing tests pass before and after changes

The CLAUDE.md testing checklist captures the workflow: designs prescribe testing,
tests define behavior, implementation follows.

When a change can affect shipped CLI behavior, run both `pnpm test` and
`pnpm test:e2e`.

Prefer constructor or function seams and Effect test layers over module mocks.
Use targeted mocks mainly at third-party boundaries where introducing an
explicit seam would add noise without improving the design.

---

## Test Quality Trade-offs

Not all test properties can be maximized simultaneously. Kent Beck's Test
Desiderata framework helps navigate trade-offs:

**Prioritize in this project:**

- **Isolated** — Tests don't affect each other (fresh state per test)
- **Deterministic** — Same result if nothing changes
- **Behavioral** — Sensitive to behavior changes, not structure changes
- **Specific** — Failure cause is obvious from the test name and assertion

**Accept trade-offs on:**

- **Fast** — E2E tests are slower by design; that's acceptable for integration
  confidence
- **Writable** — Some Effect test layers require setup; the type safety is worth
  the verbosity

The CLAUDE.md quality checklist provides the full set of properties to evaluate.

Prefer tests that exercise observable behavior over tests that only restate
static declarations, source layout, or configuration structure. If a rule is
purely structural, prefer linting or static analysis unless the runtime effect
is what matters.

For new Effect tests, prefer `@effect/vitest` helpers such as `it.effect`,
`it.scoped`, and `it.layer` over manual `Effect.runPromise` wiring.

---

## See Also

- [Feature Delivery Guide](./feature-delivery.md) — Proposal to verification
  checks
- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/) — Kent Beck's
  framework for evaluating test quality trade-offs
