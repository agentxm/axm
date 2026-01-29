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

## Unit and E2E Tests

| Test | Location                     | What it tests                             | Dependencies     |
| ---- | ---------------------------- | ----------------------------------------- | ---------------- |
| Unit | `packages/**/*.test.ts`      | Business logic (pure functions, handlers) | Test layers      |
| E2E  | `packages/cli/e2e/*.test.ts` | Full CLI as subprocess                    | Built binary, fs |

### When to Use Each

**Unit tests** for:

- Pure functions and data transformations
- Handlers (effectful entry points)
- Business logic with service dependencies
- Error handling paths

Handler tests are unit tests. They may need test layers for service
dependencies—see `/effect-testing`.

**E2E tests** for:

- CLI command parsing and output
- Integration between commands and file system
- User-facing behavior verification

---

## See Also

- [Test Desiderata](https://kentbeck.github.io/TestDesiderata/) — Kent Beck's
  framework for evaluating test quality trade-offs
