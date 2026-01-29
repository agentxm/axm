# Testing Guide

Orientation for testing in this project: unit and e2e tests, when to use each,
and what makes tests valuable.

> [Testing](../../CLAUDE.md#testing) — workflow and quality checklist

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

## Key Resources

- [Vitest Documentation](https://vitest.dev/) — Test runner API and configuration
- [Effect Testing](https://effect.website/docs/testing) — Testing Effect programs

## Skills

- `/testing-basics` — Test quality principles
- `/testing-unit` — Unit test patterns for pure functions
- `/testing-e2e` — E2E test patterns for CLI commands
- `/effect-testing` — Effect testing patterns (handlers typically need test layers)
- `/effect-service` — Service patterns including test layer construction

---

## Test Levels

This project uses two test levels with distinct purposes:

**Unit tests** verify isolated behavior of pure functions, handlers, and business
logic. They run fast, require no external dependencies, and catch regressions in
core logic. Place unit tests alongside source files (`parser.test.ts` next to
`parser.ts`).

**E2E tests** verify CLI commands work correctly from the user's perspective.
They spawn the actual CLI binary, interact with the file system, and validate
user-facing behavior. Place E2E tests in `packages/cli/e2e/`.

| Aspect           | Unit Tests                    | E2E Tests                        |
| ---------------- | ----------------------------- | -------------------------------- |
| **Scope**        | Single function or handler    | Full CLI command                 |
| **Speed**        | Milliseconds                  | Seconds                          |
| **Dependencies** | Mocked or test layers         | Real file system, real binary    |
| **Location**     | Colocated with source         | `packages/cli/e2e/`              |
| **When to use**  | Logic correctness, edge cases | CLI parsing, integration, output |

---

## When to Write Tests

Tests serve as executable specifications that define desired behavior before
implementation. This project follows test-first development for most changes:

- **New features** — Write tests that describe expected behavior, then implement
- **Bug fixes** — Write a failing test that reproduces the bug, then fix it
- **Refactoring** — Ensure existing tests pass before and after changes

The CLAUDE.md testing checklist captures the workflow: designs prescribe testing,
tests define behavior, implementation follows.

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
