---
status: active
description:
  Testing patterns for unit tests, handler tests, and E2E tests. Covers test
  organization, isolation, mocking services, and CLI subprocess testing with
  execa.
---

# Testing Guidelines

Patterns for writing tests at all layers: unit tests for business logic,
handler tests with mock services, and E2E tests for CLI commands.

**Not covered:** Performance testing, load testing, or CI/CD pipeline
configuration.

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

## Unit Tests

Unit tests verify pure business logic without dependencies.

### Unit Test Pattern

```typescript
import { describe, it, expect } from "vitest";
import { parseExtensionRef } from "./extension-ref.js";

describe("parseExtensionRef", () => {
  it("parses GitHub shorthand", () => {
    const result = parseExtensionRef("owner/repo");
    expect(result).toEqual({
      type: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns error for invalid format", () => {
    const result = parseExtensionRef("invalid");
    expect(result).toBeInstanceOf(ParseError);
  });
});
```

### Unit Test Checklist

- [ ] **Pure functions only** — No I/O, no services, no side effects
- [ ] **Single behavior per test** — One assertion per logical behavior
- [ ] **Descriptive names** — Test name describes the behavior being verified
- [ ] **Edge cases covered** — Empty inputs, boundaries, error cases

---

## Handler Tests

Handler tests verify Effect handlers with mock service layers.

### Handler Test Pattern

```typescript
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { handleAdd } from "./add.handler.js";
import { ExtensionService } from "@agentxm/core";

describe("handleAdd", () => {
  const mockExtensionService = {
    add: vi.fn(() => Effect.succeed({ installed: true })),
    list: vi.fn(() => Effect.succeed([])),
  };

  const TestLayer = Layer.succeed(ExtensionService, mockExtensionService);

  it("adds extension successfully", async () => {
    const result = await Effect.runPromise(
      handleAdd({ ref: "owner/repo" }).pipe(Effect.provide(TestLayer)),
    );

    expect(result.installed).toBe(true);
    expect(mockExtensionService.add).toHaveBeenCalledWith("owner/repo");
  });

  it("handles service errors", async () => {
    mockExtensionService.add.mockReturnValueOnce(
      Effect.fail(new ExtensionError({ message: "Not found" })),
    );

    const result = await Effect.runPromise(
      handleAdd({ ref: "owner/repo" }).pipe(
        Effect.provide(TestLayer),
        Effect.either,
      ),
    );

    expect(result._tag).toBe("Left");
  });
});
```

### Handler Test Checklist

- [ ] **Mock services** — All dependencies provided via test layers
- [ ] **Fresh mocks per test** — Reset or recreate mocks to ensure isolation
- [ ] **Error paths tested** — Verify error handling with failing services
- [ ] **Effect.either for errors** — Use `Effect.either` to assert on failures

---

## E2E Tests

E2E tests spawn the built CLI binary and verify end-to-end behavior.

### E2E Test Setup

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("axm add", () => {
  let tempDir: string;
  const cli = (args: string[]) =>
    execa("./dist/cli.js", args, { cwd: tempDir });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "axm-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("adds extension from local path", async () => {
    const { exitCode, stdout } = await cli(["add", "./fixtures/sample-ext"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Added sample-ext");
  });

  it("exits 1 for invalid reference", async () => {
    const result = await cli(["add", "invalid"]).catch((e) => e);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid extension reference");
  });
});
```

### E2E Test Patterns

| Pattern               | Implementation                                     |
| --------------------- | -------------------------------------------------- |
| Isolated temp dir     | `mkdtemp()` in `beforeEach`, `rm()` in `afterEach` |
| CLI invocation        | `execa("./dist/cli.js", args, { cwd: tempDir })`   |
| Exit code assertion   | `expect(result.exitCode).toBe(0)`                  |
| Output assertion      | `expect(result.stdout).toContain("expected")`      |
| Error assertion       | Catch rejected promise, assert on stderr           |
| File system assertion | Read files from tempDir, verify contents           |
| Test fixtures         | Local paths in `packages/cli/e2e/fixtures/`        |

### E2E Test Checklist

- [ ] **Isolated temp directory** — Each test gets fresh directory, cleaned up after
- [ ] **Built binary** — Tests run against `./dist/cli.js`, not source
- [ ] **Exit codes verified** — Assert on 0 for success, 1 for errors
- [ ] **stdout/stderr checked** — Verify user-facing output
- [ ] **File system state verified** — Check files created/modified
- [ ] **No network calls** — Use local fixtures, not remote repos

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

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run specific test file
pnpm test packages/core/src/extension-ref.test.ts

# Run E2E tests only
pnpm test packages/cli/e2e/

# Run with coverage
pnpm test -- --coverage
```
