# Testing Guide

Testing strategy for this project: unit tests for pure functions, handler tests
with Effect test layers, and E2E tests for CLI commands. Covers test quality
principles, when to use each level, and Effect-specific patterns like service
mocking and layer construction.

> [Testing](../../CLAUDE.md#testing) — workflow and quality checklist

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

## Key Resources

- [Vitest Documentation](https://vitest.dev/) — Test runner API and configuration
- [Effect Testing](https://effect.website/docs/testing) — Testing Effect programs

## Skills

| Skill                                                            | Command | Description                                        |
| ---------------------------------------------------------------- | ------- | -------------------------------------------------- |
| [testing-basics](../../.claude/skills/testing-basics/SKILL.md)   | —       | Test quality principles and test level guidance    |
| [testing-unit](../../.claude/skills/testing-unit/SKILL.md)       | —       | Unit test patterns for pure functions              |
| [testing-handler](../../.claude/skills/testing-handler/SKILL.md) | —       | Handler test patterns with Effect test layers      |
| [axm-testing-e2e](../../.claude/skills/axm-testing-e2e/SKILL.md) | —       | E2E test patterns for CLI commands                 |
| [effect-testing](../../.claude/skills/effect-testing/SKILL.md)   | —       | Effect testing with @effect/vitest                 |
| [effect-service](../../.claude/skills/effect-service/SKILL.md)   | —       | Service patterns including test layer construction |

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

| Aspect           | Unit Tests                    | Distribution E2E                 |
| ---------------- | ----------------------------- | -------------------------------- |
| **Scope**        | Single function or handler    | Full CLI command                 |
| **Speed**        | Milliseconds                  | Seconds                          |
| **Dependencies** | Mocked or test layers         | Real file system, built artifact |
| **Location**     | Colocated with source         | `packages/<cli>-e2e/`            |
| **Tests what**   | Logic correctness, edge cases | Build integrity, CLI behavior    |
| **Runs**         | `pnpm test`                   | `pnpm test:e2e`                  |

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

---

## See Also

- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/) — Kent Beck's
  framework for evaluating test quality trade-offs
