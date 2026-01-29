---
name: testing-basics
description: Test quality principles and level overview. Use when writing or reviewing tests.
user-invocable: false
---

# Testing Basics

Foundational testing principles for this project. All tests should exhibit these
qualities regardless of level.

---

## Test Levels

| Level   | Location                         | Tests                          |
| ------- | -------------------------------- | ------------------------------ |
| Unit    | `packages/core/src/**/*.test.ts` | Pure business logic, utilities |
| Handler | `packages/cli/src/**/*.test.ts`  | Effect handlers with mocks     |
| E2E     | `packages/cli/e2e/*.test.ts`     | Full CLI as subprocess         |

**When to use each:**

- **Unit** — Pure functions in `@agentxm/core`, data transformations, utilities
- **Handler** — Effect handlers, business logic with service dependencies, error paths
- **E2E** — CLI parsing/output, file system integration, user-facing behavior

---

## Test Quality Principles

Tests should exhibit these qualities:

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

### Applying These Principles

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

## Running Tests

```bash
pnpm test                              # All tests
pnpm test -- --watch                   # Watch mode
pnpm test packages/core/               # Unit tests only
pnpm test packages/cli/e2e/            # E2E tests only
pnpm test path/to/file.test.ts         # Specific file
pnpm test -- --coverage                # With coverage
```

---

## Related Skills

- `/testing-unit` — Patterns for pure function tests
- `/testing-handler` — Patterns for Effect handler tests with mocks
- `/testing-e2e` — Patterns for CLI subprocess tests
