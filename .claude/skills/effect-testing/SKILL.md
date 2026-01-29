---
name: effect-testing
description: Effect testing patterns. Use when writing tests for Effect programs, asserting on errors, or providing test layers.
user-invocable: false
---

# Effect Testing Patterns

Patterns for testing Effect programs across all test levels.

---

## Running Effects in Tests

Use `Effect.runPromise` to execute Effects in test functions:

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

describe("myFunction", () => {
  it("returns expected value", async () => {
    const result = await Effect.runPromise(myFunction("input"));

    expect(result).toBe("expected");
  });
});
```

---

## Error Assertions

Use `Effect.either` to assert on expected failures:

```typescript
// Helper for error assertions
const runExpectError = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") return result.left;
    throw new Error("Expected failure");
  });

it("fails with ParseError for invalid input", async () => {
  const error = await runExpectError(parseSource("invalid"));

  expect(error._tag).toBe("ParseError");
});
```

---

## Providing Test Layers

Use `Effect.provide` to inject test dependencies:

```typescript
import { NodeFileSystem } from "@effect/platform-node";

// Helper to run with FileSystem layer
const runWithFs = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

it("reads file contents", async () => {
  const result = await runWithFs(readConfig("/path/to/config.json"));

  expect(result.version).toBe(1);
});
```

For mock layers, create layer factories that accept test configuration. See
`/effect-service` for the test layer design pattern.

---

## Test Helper Patterns

Define helpers at describe block scope for consistency:

```typescript
describe("myHandler", () => {
  // Success helper
  const run = <A, E>(effect: Effect.Effect<A, E, MyService>) =>
    Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

  // Error helper
  const runEither = <A, E>(effect: Effect.Effect<A, E, MyService>) =>
    Effect.runPromise(effect.pipe(Effect.either, Effect.provide(TestLayer)));

  it("succeeds with valid input", async () => {
    const result = await run(myHandler({ valid: true }));
    expect(result).toBeDefined();
  });

  it("fails with invalid input", async () => {
    const result = await runEither(myHandler({ valid: false }));
    expect(result._tag).toBe("Left");
  });
});
```

---

## Checklist

- [ ] **Effect.runPromise in tests** — Execute Effects within test functions
- [ ] **Effect.either for errors** — Assert on expected failures, not try/catch
- [ ] **Effect.provide for deps** — Inject layers, don't rely on globals
- [ ] **Helpers per describe** — Define run/runEither helpers for consistency
