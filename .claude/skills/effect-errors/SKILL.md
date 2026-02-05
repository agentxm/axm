---
name: effect-errors
description: Error modeling and handling in Effect. Use when defining errors, choosing between typed errors and defects, or implementing recovery strategies.
user-invocable: false
---

# Effect Error Modeling and Handling

Effect's error model distinguishes between **expected errors** (typed, recoverable) and **defects** (unrecoverable, crash the program). This distinction is tracked at the type level via `Effect<A, E, R>`.

---

## Expected Errors vs Defects

| Expected Errors (E channel)                   | Defects                                   |
| --------------------------------------------- | ----------------------------------------- |
| Validation failures, "not found", rate limits | Bugs, invariant violations, out-of-memory |
| Appear in type signature                      | Not tracked at type level                 |
| Caller can recover                            | No sensible recovery                      |
| Use `Effect.fail`                             | Use `Effect.die` or `Effect.orDie`        |

**Decision rule:** Use typed errors when a caller could do something meaningful (retry, show message, fallback). Use defects when assumptions are violated and no local recovery makes sense.

```typescript
// Typed error: caller can handle "not found"
const findUser = (id: string): Effect.Effect<User, UserNotFoundError> => ...

// Defect: config must exist at startup, no recovery possible
const main = Effect.gen(function* () {
  const config = yield* loadConfig.pipe(Effect.orDie);
});
```

---

## Defining Errors with TaggedError

Both `Data.TaggedError` and `Schema.TaggedError` create discriminated errors enabling `catchTag`.

### Data.TaggedError — Internal Errors

For in-memory errors that never cross network boundaries:

```typescript
import { Data } from "effect";

class DbError extends Data.TaggedError("DbError")<{
  readonly cause: unknown;
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string;
  readonly message: string;
}> {}
```

### Schema.TaggedError — API-Facing Errors

For errors that must serialize (HTTP responses, RPC):

```typescript
import { Schema } from "effect";

class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()("UserNotFoundError", {
  id: Schema.String,
}) {}

// Use Schema.Defect for unknown causes, not Schema.Unknown
class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  message: Schema.String,
  cause: Schema.Defect,
}) {}
```

### Yielding Errors Directly

TaggedErrors extend `YieldableError` — prefer direct yield for conciseness:

```typescript
const validate = (input: string) =>
  Effect.gen(function* () {
    if (input.length === 0) {
      // Preferred: direct yield
      yield* new ValidationError({ field: "input", message: "Required" });

      // Also valid: explicit Effect.fail
      yield* Effect.fail(new ValidationError({ field: "input", message: "Required" }));
    }
    return input;
  });
```

---

## Error Composition

Errors accumulate automatically as union types when composing effects:

```typescript
declare const fetchUser: (id: string) => Effect.Effect<User, HttpError>;
declare const validateUser: (u: User) => Effect.Effect<ValidUser, ValidationError>;

// Type: Effect<ValidUser, HttpError | ValidationError>
const program = Effect.gen(function* () {
  const user = yield* fetchUser("123");
  return yield* validateUser(user);
});
```

---

## Error Recovery with catchTag

Each `catchTag` removes the handled error from the union:

```typescript
declare const program: Effect.Effect<string, HttpError | ValidationError | AuthError>;

const handled = program.pipe(
  Effect.catchTag("HttpError", (e) => (e.retryable ? Effect.retry(retryPolicy) : Effect.fail(e))),
  Effect.catchTag("AuthError", () => Effect.succeed("anonymous")),
);
// Type: Effect<string, ValidationError> — only unhandled errors remain
```

### Multiple Tags at Once

```typescript
program.pipe(
  Effect.catchTags({
    HttpError: (e) => Effect.succeed("http fallback"),
    AuthError: (e) => Effect.succeed("auth fallback"),
  }),
);
```

### catchAll vs catchAllCause

- `Effect.catchAll` — handles all typed errors, **not defects**
- `Effect.catchAllCause` — handles errors AND defects (use at system boundaries only)

---

## Error Transformation with mapError

Transform errors at architectural boundaries:

```typescript
const findById = (id: UserId) =>
  Effect.gen(function* () {
    const response = yield* http.get(`/users/${id}`);
    return yield* parseResponse(response);
  }).pipe(
    Effect.catchTag("ResponseError", (error) =>
      error.response.status === 404
        ? Effect.fail(new UserNotFoundError({ id }))
        : Effect.fail(new GenericUsersError({ id, error })),
    ),
  );
```

---

## Escape Hatches

### Effect.orDie

Converts typed errors to defects. Stack trace comes from `orDie` call, not original failure:

```typescript
// Acceptable: config must exist at startup
const config = yield * loadConfig.pipe(Effect.orDie);

// Avoid: hiding errors that callers could handle
const user = yield * findUser(id).pipe(Effect.orDie); // ❌
```

### Option.getOrThrow / Either.getOrThrow

Use only at program edges or in tests:

```typescript
// Tests: acceptable
expect(Option.getOrThrow(result)).toBe(expected);

// Business logic: avoid — keeps error in typed world
const value = Option.match(opt, {
  onNone: () => defaultValue,
  onSome: (v) => v,
});
```

### Effect.runSync

Synchronous execution, throws on failure. Use at program boundaries only:

```typescript
// Entry point: acceptable
const result = Effect.runSync(pureComputation);

// Deep in logic: avoid — prefer Effect.runSyncExit for Exit type
```

---

## Common Anti-Patterns

### Throwing in Helper Functions

Never throw in pure helper functions — return typed Effect errors instead:

```typescript
// ❌ Throws raw error, loses type safety
const getPath = (source: Source): string => {
  if (source._tag === "Remote") throw new Error("Not supported");
  return source.path;
};

// ✅ Returns typed Effect
const getPath = (source: Source): Effect.Effect<string, SourceError> =>
  source._tag === "Remote"
    ? Effect.fail(new SourceError({ message: "Not supported" }))
    : Effect.succeed(source.path);
```

**Exception:** Functions named `unsafe*` or `*OrThrow` may throw intentionally (like `Option.getOrThrow`). Use this pattern sparingly for escape hatches where the caller explicitly opts out of Effect error handling.

### Casting Parsed Data Without Validation

Always validate external data with Schema:

```typescript
// ❌ Cast without validation — runtime errors later
const data = yield * Effect.try({ try: () => YAML.parse(content) as Config });

// ✅ Schema validation catches issues at parse time
const json = yield * Effect.try({ try: () => YAML.parse(content) });
const data =
  yield *
  Schema.decodeUnknown(ConfigSchema)(json).pipe(
    Effect.mapError((e) => new ParseError({ message: e.message })),
  );
```

### Swallowing Error Context

```typescript
// ❌ Original error lost
Effect.tryPromise({
  try: () => externalLib.call(),
  catch: () => new MyError(), // Where did the real error go?
});

// ✅ Preserve cause
Effect.tryPromise({
  try: () => externalLib.call(),
  catch: (error) => new MyError({ cause: error }),
});
```

### Forgetting yield\*

Without `yield*`, effects become values in success channel:

```typescript
// ❌ Effect.fail returned as success value
if (bad) return Effect.fail("error");

// ❌ Log never executes
Effect.log("message");

// ✅ Both need yield*
if (bad) return yield * Effect.fail("error");
yield * Effect.log("message");
```

### Handling Errors Too Far from Source

```typescript
// ❌ Generic library error handled far from where it occurred
program.pipe(Effect.catchTag("ElementNotFound", () => ...)); // Which element?

// ✅ Convert to domain error immediately
const findConfig = (path: string) =>
  readFile(path).pipe(
    Effect.catchTag("SystemError", (e) =>
      Effect.fail(new ConfigNotFoundError({ path, cause: e }))
    )
  );
```

### Effect.either Before Spans

```typescript
// ❌ Span never records failure
pipe(mayFail, Effect.either, Effect.withSpan("op"));

// ✅ Span captures error before either moves it
pipe(mayFail, Effect.withSpan("op"), Effect.either);
```

---

## Layered Architecture Error Flow

### Repository Layer

Catches external errors immediately, converts to domain errors:

```typescript
const findById = (id: string) =>
  Effect.tryPromise({
    try: () => db.query(`SELECT * FROM users WHERE id = $1`, [id]),
    catch: (error) => new DbError({ cause: error }),
  }).pipe(
    Effect.flatMap((rows) =>
      rows.length === 0 ? Effect.succeed(Option.none()) : Effect.succeed(Option.some(rows[0])),
    ),
  );
```

### Service Layer

Composes effects, handles recoverable cases:

```typescript
const getOrCreateUser = (id: string) =>
  findById(id).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => createUser(id),
        onSome: Effect.succeed,
      }),
    ),
    Effect.catchTag("DbError", (e) => (e.retryable ? Effect.retry(retryPolicy) : Effect.fail(e))),
  );
```

### Entry Point

Exhaustively handles errors for framework response:

```typescript
app.get("/users/:id", async (req, res) => {
  const exit = await runtime.runPromiseExit(
    getUser(req.params.id).pipe(
      Effect.catchTags({
        UserNotFoundError: () => Effect.succeed({ status: 404, body: "Not found" }),
        ValidationError: (e) => Effect.succeed({ status: 400, body: e.message }),
        DbError: () => Effect.succeed({ status: 500, body: "Internal error" }),
      }),
    ),
  );
  // Send response based on exit
});
```

---

## Cause: The Full Story

`Cause<E>` preserves all failure information:

- `Fail<E>` — expected errors
- `Die` — defects (with original error)
- `Interrupt` — fiber interruptions
- `Sequential` / `Parallel` — composed causes

Even `orDie` preserves original error in Cause for diagnostics:

```typescript
// At system boundary, inspect full cause
Effect.catchAllCause(program, (cause) => {
  console.error(Cause.pretty(cause));
  return Effect.succeed(fallback);
});
```

---

## Effect Errors Checklist

- [ ] **Typed errors for recoverable cases** — Validation, not-found, rate limits
- [ ] **Defects for invariant violations** — Bugs, missing config at startup
- [ ] **Data.TaggedError for internal** — In-memory, never serialized
- [ ] **Schema.TaggedError for APIs** — Serializable, use `Schema.Defect` for cause
- [ ] **Preserve cause** — Always include `cause: unknown` in error constructors
- [ ] **Convert at source** — Transform library errors to domain errors immediately
- [ ] **Never throw in helpers** — Return typed Effect errors (exception: `unsafe*`/`*OrThrow`)
- [ ] **Validate parsed data** — Use Schema.decodeUnknown, not type casts
- [ ] **Use catchTag** — Narrow error unions, prove exhaustive handling
- [ ] **orDie sparingly** — Only when no caller can recover
- [ ] **No yield\* = no execution** — Always yield effects in generators
- [ ] **Spans before either** — Observability captures failures correctly
