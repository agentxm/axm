# Testing Guide

Orientation for testing in this project: why we use three test layers, when to
use each, and what makes tests valuable.

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

## Key Resources

- [Vitest Documentation](https://vitest.dev/) — Test runner API and configuration
- [Effect Testing](https://effect.website/docs/testing) — Testing Effect programs

## Skills

- `/testing-basics` — Test quality principles and layer overview
- `/testing-unit` — Unit test patterns for pure functions in `packages/core/`
- `/testing-handler` — Handler test patterns with mock services
- `/testing-e2e` — E2E test patterns for CLI commands
- `/effect-testing` — Effect testing patterns (running effects, error assertions)
- `/effect-service` — Service patterns including test layer construction

---

## Testing Layers

This project uses three testing layers, each with different scope and
dependencies:

| Layer   | Location               | What it tests                    | Dependencies     |
| ------- | ---------------------- | -------------------------------- | ---------------- |
| Unit    | `packages/core/src/**` | Pure business logic, utilities   | None (pure)      |
| Handler | `packages/cli/src/**`  | Effect handlers with mock layers | Mock services    |
| E2E     | `packages/cli/e2e/`    | Full CLI as subprocess           | Built binary, fs |

### When to Use Each Layer

**Unit tests** for:

- Pure functions in `@agentxm/core`
- Data transformations and validations
- Utility functions

**Handler tests** for:

- Effect handler functions (e.g., `add.handler.ts`)
- Business logic that depends on services
- Error handling paths

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
