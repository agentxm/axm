---
name: effect-testing
description: Effect testing with @effect/vitest. Use when any test needs to run Effect programs, test errors, or provide layers.
user-invocable: false
---

# Effect Testing with @effect/vitest

Use `@effect/vitest` to run Effect programs directly in tests without bridging
to Promise-land. Stay in Effect-land for cleaner, more idiomatic code.

---

## Setup

```bash
pnpm add -D @effect/vitest
```

Requires vitest 1.6.0 or later.

---

## Basic Usage

Import from `@effect/vitest` instead of `vitest`:

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

describe("myFunction", () => {
  it.effect("returns expected value", () =>
    Effect.gen(function* () {
      const result = yield* myFunction("input");
      expect(result).toBe("expected");
    }),
  );
});
```

No `async`, no `await`, no `runPromise`. The test stays in Effect-land.

---

## Error Assertions

Use `Effect.flip` to test expected failures. Flip swaps success and error
channels—if the effect fails, the error becomes the success value:

```typescript
it.effect("fails with ParseError for invalid input", () =>
  Effect.gen(function* () {
    const error = yield* parseSource("invalid").pipe(Effect.flip);
    expect(error).toBeInstanceOf(ParseError);
  }),
);
```

For asserting the full Exit (success or failure):

```typescript
import { Exit } from "effect";

it.effect("returns expected exit", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(divide(4, 0));
    expect(exit).toStrictEqual(Exit.fail("Cannot divide by zero"));
  }),
);
```

---

## Test Types

| Type              | Use case                                      |
| ----------------- | --------------------------------------------- |
| `it.effect`       | Standard tests with TestContext (TestClock)   |
| `it.live`         | Tests requiring real time (see below)         |
| `it.scoped`       | Tests with resources requiring Scope          |
| `it.scopedLive`   | Scoped tests with live environment            |
| `it.effect.skip`  | Temporarily skip a test                       |
| `it.effect.only`  | Run only this test                            |
| `it.effect.fails` | Assert test fails (for tracking known issues) |

**When to use `it.live`:**

- File timestamp checks (mtime comparisons)
- Elapsed time measurements for concurrency tests
- Tests that call `Date.now()` and expect real values
- Any test where TestClock (starting at 0ms) would cause failures
- Tests with real retry delays (specify timeout: `it.live("...", () => ..., { timeout: 10000 })`)

---

## Providing Layers

Use `Effect.provide` within the test:

```typescript
import { NodeFileSystem } from "@effect/platform-node";

it.effect("reads file contents", () =>
  Effect.gen(function* () {
    const result = yield* readConfig("/path/to/config.json");
    expect(result.version).toBe(1);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
```

For shared layers across tests, define a helper:

```typescript
describe("myHandler", () => {
  const withTestLayer = <A, E>(effect: Effect.Effect<A, E, MyService>) =>
    effect.pipe(Effect.provide(TestMyService));

  it.effect("succeeds with valid input", () =>
    withTestLayer(
      Effect.gen(function* () {
        const result = yield* myHandler({ valid: true });
        expect(result).toBeDefined();
      }),
    ),
  );
});
```

---

## TestClock

`it.effect` provides `TestContext` including `TestClock` (starts at 0ms):

```typescript
import { TestClock, Clock } from "effect";

it.effect("handles timeout", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.sleep("1 second").pipe(Effect.fork);
    yield* TestClock.adjust("1 second");
    yield* fiber.join;
    const now = yield* Clock.currentTimeMillis;
    expect(now).toBe(1000);
  }),
);
```

---

## Logging

`it.effect` suppresses logs by default. To enable:

```typescript
import { Logger } from "effect";

it.effect("with logging", () =>
  Effect.gen(function* () {
    yield* Effect.log("debug message");
  }).pipe(Effect.provide(Logger.pretty)),
);

// Or use it.live for real logging
it.live("with live logging", () =>
  Effect.gen(function* () {
    yield* Effect.log("visible in output");
  }),
);
```

---

## Checklist

- [ ] **Import from @effect/vitest** — Not plain vitest
- [ ] **Use it.effect** — Stay in Effect-land, no runPromise
- [ ] **Effect.flip for errors** — Swap channels to assert on failures
- [ ] **Effect.provide for deps** — Inject layers within the test
- [ ] **it.scoped for resources** — When test requires Scope
