# Design: Align Effect patterns

## Context

The project uses Effect as its standard library for all business logic and I/O. Four
skills document the expected patterns:

- `/effect-basics` - Core patterns: Effect.gen, tryPromise, typed errors, concurrency
- `/effect-service` - Service interfaces, TaggedError, layers, retry policies
- `/effect-testing` - Testing patterns: runPromise, either, test layers
- `/effect-wrapping` - Wrapping Promise APIs with Effect.tryPromise

A comprehensive audit found the codebase is 98% compliant. This change addresses the
remaining gaps.

## Goals / Non-Goals

**Goals:**

- DES-1: Standardize error types with `retryable` field per `/effect-service`
- DES-2: Add retry policies to network operations per `/effect-service`
- DES-3: Use `Effect.all()` for parallelizable loops per `/effect-basics`
- DES-4: Clean up test helpers per `/effect-testing`
- DES-5: Ensure all error paths include `cause` for debugging

**Non-Goals:**

- Creating new services (not needed for current scope)
- Changing user-facing behavior
- Refactoring working code that follows conventions

## Decisions

### Decision: Add `retryable: boolean` to all error types

All error types extending `Data.TaggedError` MUST include a `retryable` field. This
enables consistent retry policy composition and future automatic retry logic.

**Pattern:**

```typescript
export class MyError extends Data.TaggedError("MyError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}
```

**Retryable guidelines:**

- `true` for transient errors (network timeouts, rate limits, temporary failures)
- `false` for permanent errors (validation, not found, permissions)
- When wrapping unknown errors, default to `false`

### Decision: Retry policy for HTTP operations

Network operations in `wellknown.ts` SHALL use `Effect.retry()` with exponential
backoff for transient errors.

**Pattern:**

```typescript
import { Duration, Schedule } from "effect";

const retryPolicy = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.whileInput((error: WellKnownError) => error.retryable),
);

const response =
  yield *
  pipe(
    client.get(url),
    Effect.mapError(mapHttpError),
    Effect.retry(retryPolicy),
  );
```

### Decision: Parallelize skill installation loop

The `installSkillsFromFileSystem` function in the add handler processes skills
sequentially. Since skill installations are independent, use `Effect.all()` with
unbounded concurrency.

**Before:**

```typescript
for (const skill of skills) {
  yield * installSkill(skill);
}
```

**After:**

```typescript
yield *
  Effect.all(
    skills.map((skill) => installSkill(skill)),
    { concurrency: "unbounded" },
  );
```

### Decision: Test helper cleanup

Convert `.then()` chains in test helpers to async/await for consistency with
`/effect-testing` patterns.

**Before:**

```typescript
const parseError = (input: string) =>
  Effect.runPromise(parseSource(input).pipe(Effect.either)).then((result) => {
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") return result.left;
    throw new Error("Expected failure");
  });
```

**After:**

```typescript
const parseError = async (input: string) => {
  const result = await Effect.runPromise(
    parseSource(input).pipe(Effect.either),
  );
  expect(result._tag).toBe("Left");
  if (result._tag === "Left") return result.left;
  throw new Error("Expected failure");
};
```

## Risks / Trade-offs

- **Risk:** Adding `retryable` field requires updating all error construction sites
  - **Mitigation:** Most errors are constructed in one place; grep for `new.*Error({`

- **Risk:** Retry policies could mask intermittent issues
  - **Mitigation:** Keep retry count low (3), use exponential backoff, only retry
    on explicitly retryable errors

- **Risk:** Parallel skill installation could surface concurrency bugs
  - **Mitigation:** `installSkillToAgents` already uses unbounded concurrency
    successfully; this extends the same pattern

## Migration Plan

1. Add `retryable` field to error types (6 files)
2. Update error construction sites to set `retryable` appropriately
3. Add retry policy to wellknown.ts HTTP operations
4. Refactor add handler to parallelize skill loop
5. Clean up test helper in source-parser.test.ts
6. Add `cause` field to validation errors in init handler
7. Run full test suite to verify no regressions

## Open Questions

None - all decisions are straightforward applications of documented patterns.
