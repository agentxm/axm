---
name: testing
description: Testing patterns for this codebase. Use when writing unit tests, integration tests, or E2E tests.
user-invocable: false
---

# Testing Patterns

Apply these patterns when writing tests. For full rationale and examples, see
[testing-guidelines.md](../../../docs/guides/testing-guidelines.md).

---

## Testing Layers

| Layer   | Location               | Tests                            | Dependencies     |
| ------- | ---------------------- | -------------------------------- | ---------------- |
| Unit    | `packages/core/src/**` | Pure business logic, utilities   | None (pure)      |
| Handler | `packages/cli/src/**`  | Effect handlers with mock layers | Mock services    |
| E2E     | `packages/cli/e2e/`    | Full CLI as subprocess           | Built binary, fs |

---

## Unit Tests

For pure functions in `@agentxm/core`:

```typescript
import { describe, it, expect } from "vitest";

describe("parseExtensionRef", () => {
  it("parses GitHub shorthand", () => {
    const result = parseExtensionRef("owner/repo");
    expect(result).toEqual({ type: "github", owner: "owner", repo: "repo" });
  });
});
```

### Unit Test Checklist

- [ ] **Pure functions only** — No I/O, no services, no side effects
- [ ] **Single behavior per test** — One assertion per logical behavior
- [ ] **Descriptive names** — Test name describes behavior being verified
- [ ] **Edge cases covered** — Empty inputs, boundaries, error cases

---

## Handler Tests

For Effect handlers with mock service layers:

```typescript
const mockService = { add: vi.fn(() => Effect.succeed({ installed: true })) };
const TestLayer = Layer.succeed(ExtensionService, mockService);

it("adds extension", async () => {
  const result = await Effect.runPromise(
    handleAdd({ ref: "owner/repo" }).pipe(Effect.provide(TestLayer)),
  );
  expect(result.installed).toBe(true);
});
```

### Handler Test Checklist

- [ ] **Mock services** — All dependencies via test layers
- [ ] **Fresh mocks per test** — Reset or recreate for isolation
- [ ] **Error paths tested** — Verify with failing services
- [ ] **Effect.either for errors** — Assert on failures

---

## E2E Tests

For CLI commands using execa:

```typescript
let tempDir: string;
const cli = (args: string[]) => execa("./dist/cli.js", args, { cwd: tempDir });

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "axm-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

it("adds extension from local path", async () => {
  const { exitCode, stdout } = await cli(["add", "./fixtures/sample-ext"]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("Added");
});
```

### E2E Test Checklist

- [ ] **Isolated temp directory** — Fresh per test, cleaned up after
- [ ] **Built binary** — Tests run against `./dist/cli.js`
- [ ] **Exit codes verified** — 0 for success, 1 for errors
- [ ] **stdout/stderr checked** — Verify user-facing output
- [ ] **File system verified** — Check files created/modified
- [ ] **No network calls** — Use local fixtures

---

## Test Quality Principles

| Quality                   | Description                      |
| ------------------------- | -------------------------------- |
| **Isolated**              | Same results regardless of order |
| **Deterministic**         | Same result if nothing changes   |
| **Fast**                  | Run quickly                      |
| **Behavioral**            | Sensitive to behavior changes    |
| **Structure-insensitive** | Insensitive to structure changes |
| **Specific**              | Failure cause obvious            |
| **Predictive**            | Passing means production-ready   |
