# Testing Guide

Orientation for testing in this project: why we use three test levels, when to
use each, and what makes tests valuable.

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

## Key Resources

- [Vitest Documentation](https://vitest.dev/) — Test runner API and configuration
- [Effect Testing](https://effect.website/docs/testing) — Testing Effect programs

## Skills

- `/testing-basics` — Test quality principles and level overview
- `/testing-unit` — Unit test patterns for pure functions
- `/testing-e2e` — E2E test patterns for CLI commands
- `/effect-testing` — Effect testing patterns (handlers typically need test layers)
- `/effect-service` — Service patterns including test layer construction

---

## Test Levels

This project uses two test levels:

| Level | Location                     | What it tests                             | Dependencies     |
| ----- | ---------------------------- | ----------------------------------------- | ---------------- |
| Unit  | `packages/**/*.test.ts`      | Business logic (pure functions, handlers) | Test layers      |
| E2E   | `packages/cli/e2e/*.test.ts` | Full CLI as subprocess                    | Built binary, fs |

### When to Use Each Level

**Unit tests** for:

- Pure functions and data transformations
- Handlers (effectful entry points)
- Business logic with service dependencies
- Error handling paths

Handlers are unit tests. They may need test layers for service dependencies—see
`/effect-testing`.

**E2E tests** for:

- CLI command parsing and output
- Integration between commands and file system
- User-facing behavior verification

---

## Test Quality Principles

Tests should exhibit these qualities (adapted from Kent Beck's test desiderata):

| Quality                   | Description                          |
| ------------------------- | ------------------------------------ |
| **Isolated**              | Same results regardless of run order |
| **Composable**            | Test dimensions separately           |
| **Deterministic**         | Same result if nothing changes       |
| **Fast**                  | Run quickly                          |
| **Writable**              | Cheap to write relative to code cost |
| **Readable**              | Comprehensible, motivation clear     |
| **Behavioral**            | Sensitive to behavior changes        |
| **Structure-insensitive** | Insensitive to structure changes     |
| **Automated**             | Run without human intervention       |
| **Specific**              | Failure cause obvious                |
| **Predictive**            | Passing means production-ready       |
| **Inspiring**             | Passing inspires confidence          |

### Applying Quality Principles

**Isolated + Deterministic:**

- Fresh state per test (temp dirs, mock resets)
- No shared mutable state between tests
- No dependency on test execution order

**Behavioral + Structure-insensitive:**

- Test what the code does, not how it's structured
- Avoid testing implementation details
- Refactoring shouldn't break tests

**Specific + Readable:**

- One logical assertion per test
- Descriptive test names that explain the behavior
- Clear arrange/act/assert structure

---

## See Also

- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/) — Kent Beck's
  framework for evaluating test quality trade-offs
