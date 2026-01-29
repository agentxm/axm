---
name: effect-basics
description: Core Effect patterns for this codebase. Start here for Effect. Covers Effect.gen, tryPromise, typed errors, concurrency.
user-invocable: false
---

# Effect Basics

This project uses Effect for all business logic and I/O. Do NOT use raw Promises
or async/await.

---

## Core Principles

- All async operations return `Effect<A, E, R>`, never `Promise<T>`
- Use typed errors (`E`) instead of thrown exceptions
- Use dependency injection via Effect services (`R`)

---

## When to Use Services vs Simple Functions

**Default to simple functions.** Services add indirection—only use them when
justified.

| Use simple functions when...                | Use services when...                         |
| ------------------------------------------- | -------------------------------------------- |
| Operation is stateless                      | Shared mutable state (caches, pools)         |
| No shared configuration beyond dependencies | Complex initialization requiring cleanup     |
| Function composes well with other Effects   | Configuration shared across multiple methods |
| Testing via `Effect.provide` is sufficient  | Need to swap entire implementation in tests  |

### Simple Function Example

```typescript
// Just a function returning an Effect—no service needed
export const computeIntegrity = (
  dir: string,
): Effect.Effect<string, FileSystemError, FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const files = yield* fs.readDirectory(dir);
    // ... compute hash
    return hash;
  });
```

---

## Pattern Mapping

| Instead of...          | Use...                                             |
| ---------------------- | -------------------------------------------------- |
| `async function foo()` | `const foo = Effect.gen(function* () { ... })`     |
| `await promise`        | `yield* Effect.tryPromise(() => promise)`          |
| `Promise.all([a, b])`  | `Effect.all([a, b], { concurrency: "unbounded" })` |
| `try/catch`            | Typed errors with `Effect.catchTag`                |
| `fs.readFile`          | `@effect/platform` FileSystem service              |
| `fetch`                | `@effect/platform` HttpClient service              |

---

## Common Patterns

### Effect Generator Function

```typescript
const processFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const content = yield* fs.readFileString(path);
    const parsed = yield* parseContent(content);
    return parsed;
  });
```

### Wrapping External Promise APIs

```typescript
const fetchData = (url: string) =>
  Effect.tryPromise({
    try: () => externalLib.fetch(url),
    catch: (error) => new FetchError({ cause: error }),
  });
```

### Concurrent Operations

```typescript
// Run independent operations concurrently
const results =
  yield *
  Effect.all([fetchUsers(), fetchProducts(), fetchOrders()], {
    concurrency: "unbounded",
  });
```

### Error Handling

```typescript
// Typed error handling with catchTag
const result =
  yield *
  fetchData(url).pipe(
    Effect.catchTag("FetchError", (error) =>
      error.retryable
        ? Effect.retry(fetchData(url), retryPolicy)
        : Effect.fail(error),
    ),
  );
```

---

## Running Effects

| Context         | Method                                      |
| --------------- | ------------------------------------------- |
| CLI entry point | `Effect.runPromise` or `BunRuntime.runMain` |
| Tests           | `Effect.runPromise` within test functions   |
| Business logic  | **Never** — compose Effects, don't run them |

### Effect Basics Checklist

- [ ] **No raw Promises** — All async operations use Effect
- [ ] **No async/await** — Use `Effect.gen` with `yield*`
- [ ] **Typed errors** — Use `Effect.tryPromise` with error mapping
- [ ] **Concurrent when independent** — Use `Effect.all` with concurrency
- [ ] **Services for I/O** — Use `@effect/platform` services
- [ ] **No runPromise in logic** — Only at entry points
