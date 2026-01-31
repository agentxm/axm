## Context

The project uses Effect for all business logic with typed errors and service dependencies. Tests currently use `Effect.runPromise()` wrappers to bridge Effect code to Vitest's async test runners. The `/effect-testing` skill documents idiomatic patterns that avoid this bridging.

## Goals / Non-Goals

**Goals:**

- Convert Effect-based tests to use `@effect/vitest` patterns
- Eliminate `Effect.runPromise()` wrappers in favor of `it.effect`
- Use `Effect.flip` for error assertions instead of `Effect.either` + manual checks
- Maintain full test coverage and isolation

**Non-Goals:**

- Changing E2E tests (they spawn subprocess, not Effect)
- Changing command.test.ts files (they test yargs parsing, not Effect)
- Adding new test coverage (scope limited to conversion)
- Changing test logic or assertions (only patterns)

## Decisions

### DES-1: Import from @effect/vitest

Replace:

```typescript
import { describe, expect, it } from "vitest";
```

With:

```typescript
import { describe, expect, it } from "@effect/vitest";
```

**Rationale:** `@effect/vitest` re-exports standard vitest functions plus Effect-specific extensions like `it.effect`.

### DES-2: Convert async tests to it.effect

Replace:

```typescript
it("test name", async () => {
  const result = await runHandler(someEffect);
  expect(result).toBe(expected);
});
```

With:

```typescript
it.effect("test name", () =>
  Effect.gen(function* () {
    const result = yield* someEffect.pipe(Effect.provide(TestLayer));
    expect(result).toBe(expected);
  }),
);
```

**Rationale:** Stays in Effect-land. No async/await. Layer provision inline.

### DES-3: Convert error assertions with Effect.flip

Replace:

```typescript
it("fails with error", async () => {
  const result = await runHandlerEither(effectThatFails);
  expect(result._tag).toBe("Left");
  if (result._tag === "Left") {
    expect(result.left._tag).toBe("MyError");
  }
});
```

With:

```typescript
it.effect("fails with MyError", () =>
  Effect.gen(function* () {
    const error = yield* effectThatFails.pipe(
      Effect.provide(TestLayer),
      Effect.flip,
    );
    expect(error._tag).toBe("MyError");
  }),
);
```

**Rationale:** `Effect.flip` swaps success/error channels. If effect fails, the error becomes the success value. Cleaner than Either unwrapping.

### DES-4: Layer provision strategy

Use helper function for tests sharing the same layer:

```typescript
describe("myHandler", () => {
  const withTestLayer = <A, E>(effect: Effect.Effect<A, E, MyService>) =>
    effect.pipe(Effect.provide(TestLayer));

  it.effect("test one", () =>
    withTestLayer(
      Effect.gen(function* () {
        // test body
      }),
    ),
  );
});
```

**Rationale:** Reduces repetition. Each test clearly shows layer provision.

### DES-5: Preserve beforeEach/afterEach for file system setup

Tests that create temp directories still use `beforeEach`/`afterEach` for setup/cleanup since these are synchronous fs operations, not Effect operations.

**Rationale:** File system fixtures are test infrastructure, not Effect business logic. Converting to `it.scoped` with Effect-based temp directory management would require changing test implementation beyond pattern conversion.

### DES-6: Use it.live for tests requiring real time

Tests that depend on actual timing (e.g., checking file modification timestamps) must use `it.live` instead of `it.effect`:

```typescript
it.live(
  "does not modify settings file timestamp when already initialized",
  () =>
    Effect.gen(function* () {
      // ... test with real file mtimes
    }),
);
```

**Rationale:** `it.effect` provides `TestContext` with `TestClock` starting at 0ms. Tests that check real file timestamps or require actual delays need `it.live` which uses the system clock.

**Affected tests:** `init.handler.test.ts` - "does not modify settings file timestamp"

### DES-7: Layer composition with Layer.provideMerge

For handler tests requiring multiple services, compose test layers:

```typescript
const TestLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  FetchHttpClient.layer,
);

it.effect("test name", () =>
  Effect.gen(function* () {
    // test body
  }).pipe(Effect.provide(TestLayer)),
);
```

**Rationale:** `Layer.mergeAll` combines independent layers. `Layer.provideMerge` chains layers when one depends on another.

### DES-8: Test modifiers for special cases

Use test modifiers as needed:

- `it.effect.skip` - Temporarily disable a test
- `it.effect.only` - Run single test in isolation
- `it.effect.fails` - Document known failing tests

**Rationale:** These mirror standard vitest modifiers but work with Effect tests.

## Risks / Trade-offs

**Risk:** Tests may hang if Effect doesn't complete.
**Mitigation:** `it.effect` has default timeout. Add explicit timeouts if needed.

**Risk:** Developers unfamiliar with @effect/vitest patterns.
**Mitigation:** Tests serve as examples. Skills document patterns.

## Migration Plan

1. Add `@effect/vitest` dependency (already present)
2. Convert tests file-by-file in phases (see tasks.md)
3. Run full test suite after each file conversion
4. No rollback needed - pure refactoring

## Open Questions

None - patterns are documented in skills.
