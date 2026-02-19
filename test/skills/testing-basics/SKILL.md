---
name: testing-basics
description: Test quality principles and test level guidance. Start here when writing or reviewing any test. Points to level-specific skills.
user-invocable: false
---

# Testing Basics

Foundational testing principles for this project. All tests should exhibit these
qualities regardless of level.

---

## Test Organization

**Co-locate tests with the code they test.** Test structure mirrors code structure:

- `feature.ts` → `feature.test.ts` in the same directory
- `handler.ts` → `handler.test.ts` in the same directory
- Minimize testing code in separate files/folders — helpers and fixtures live near their tests
- Reading the test suite should give a clear map of the codebase's functionality

**Tests as documentation:** A well-organized test suite doubles as a behavior catalog. Test file names, describe blocks, and test names should read naturally and convey what the system does.

## Test Levels

| Level | Location                    | Tests                                     |
| ----- | --------------------------- | ----------------------------------------- |
| Unit  | `packages/**/*.test.ts`     | Business logic (pure functions, handlers) |
| E2E   | `packages/**/*.e2e.test.ts` | User-visible functional behavior          |

**When to use each:**

- **Unit** — All meaningful business logic: pure functions, data transformations, handlers, error paths
- **E2E** — User-visible functional behavior: CLI commands produce correct output, files are created/modified as expected, error messages are helpful

Handler tests are unit tests. They may need test layers for service dependencies—see `/effect-testing`.

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
pnpm test packages/cli/e2e/            # E2E tests only
pnpm test path/to/file.test.ts         # Specific file
pnpm test -- --coverage                # With coverage
```

---

## Related Skills

- `/testing-unit` — Patterns for pure function tests
- `/axm-testing-e2e` — Patterns for CLI subprocess tests
- `/effect-testing` — Effect testing patterns (handlers typically need test layers)
