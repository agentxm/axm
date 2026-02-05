---
name: effect-concurrency
description: Effect concurrency patterns - fibers, parallel execution, coordination primitives. Use when parallelizing operations, seeing sequential for/while loops with I/O, managing concurrent work, or coordinating between fibers.
user-invocable: false
---

# Effect Concurrency

**Effect provides fiber-based structured concurrency with explicit control over parallelism, error propagation, and resource safety.** Unlike `Promise.all`, Effect's concurrency is opt-in, supervised, and never leaks fibers or loses errors.

For basic iteration patterns, see /effect-iteration. For lazy/unbounded sequences, see /effect-stream.

---

## Key Insight: Sequential by Default

**`Effect.all` and `Effect.forEach` are sequential by default—unlike `Promise.all`.** This is the most common surprise for developers.

```typescript
// BEFORE: Sequential — total time = sum of all durations (~650ms)
const program = Effect.gen(function* () {
  const user = yield* fetchUser(id); // 200ms
  const posts = yield* fetchPosts(id); // 300ms
  const settings = yield* fetchSettings(id); // 150ms
  return { user, posts, settings };
});

// AFTER: Concurrent — total time ≈ max duration (~300ms)
const program = Effect.gen(function* () {
  const { user, posts, settings } = yield* Effect.all(
    {
      user: fetchUser(id),
      posts: fetchPosts(id),
      settings: fetchSettings(id),
    },
    { concurrency: "unbounded" },
  );
  return { user, posts, settings };
});
```

**Diagnostic:** If total time is the **sum** of individual durations rather than the **maximum**, concurrency will help.

---

## Concurrency Options

| Option        | Values        | Behavior                                 |
| ------------- | ------------- | ---------------------------------------- |
| Sequential    | (default)     | One at a time                            |
| `concurrency` | `number`      | Sliding window of N concurrent effects   |
| `concurrency` | `"unbounded"` | All start immediately (like Promise.all) |
| `concurrency` | `"inherit"`   | Read from context via `withConcurrency`  |

```typescript
// Bounded concurrency — 10 at a time
yield * Effect.forEach(userIds, (id) => fetchUser(id), { concurrency: 10 });

// Unbounded — all at once (use for small, known-size collections)
yield * Effect.all([a, b, c], { concurrency: "unbounded" });

// Inherit from context — library code defers to caller
const process = Effect.forEach(items, handler, { concurrency: "inherit" });
const fast = process.pipe(Effect.withConcurrency(10));
const gentle = process.pipe(Effect.withConcurrency(2));
```

---

## Primitives Summary

| Primitive                 | Purpose                           | When to Use                                      |
| ------------------------- | --------------------------------- | ------------------------------------------------ |
| `Effect.all`              | Combine effects into one          | Independent tasks whose results you need         |
| `Effect.forEach`          | Map effectful function over items | Processing collections with optional concurrency |
| `Effect.zip` / `zipWith`  | Combine exactly two effects       | Pairing two computations                         |
| `Effect.race` / `raceAll` | First success wins                | Redundant requests, failover, hedged requests    |
| `Effect.fork`             | Create supervised child fiber     | Background work attached to parent scope         |
| `Effect.forkDaemon`       | Create global-scope fiber         | Long-running services that outlive creator       |
| `Effect.forkScoped`       | Fiber tied to explicit Scope      | Fine-grained lifetime control                    |
| `Deferred<A, E>`          | One-shot synchronization          | Signaling between fibers, producer-consumer      |
| `Queue<A>`                | Async bounded/unbounded queue     | Work distribution, backpressure                  |
| `PubSub<A>`               | Broadcast messaging               | Fan-out to multiple subscribers                  |
| `Semaphore`               | Permit-based concurrency limiter  | Cross-cutting rate limits, connection pools      |
| `Latch`                   | Binary open/closed gate           | Barrier synchronization, readiness coordination  |
| `Ref<A>`                  | Atomic mutable state              | Shared counters, flags across fibers             |

---

## Fibers and Structured Concurrency

Every Effect runs on a **fiber**—a lightweight virtual thread. Fibers cooperatively yield every ~2,048 operations.

**`Effect.fork` creates a supervised child fiber.** When parent terminates, all children are automatically interrupted—no leaked fibers.

```typescript
// Child fiber — interrupted when parent completes
const fiber = yield * Effect.fork(backgroundTask);
// ... do other work ...
const result = yield * Fiber.join(fiber);
```

### Fork Types

| Fork Type           | Lifetime                      | Use When                           |
| ------------------- | ----------------------------- | ---------------------------------- |
| `Effect.fork`       | Dies with parent              | Default choice for concurrent work |
| `Effect.forkDaemon` | Global scope, survives parent | Long-running background services   |
| `Effect.forkScoped` | Tied to explicit Scope        | Fine-grained lifetime control      |

**Common mistake:** Using `forkDaemon` when you meant `fork` leaks fibers. Using `fork` when you meant `forkDaemon` kills background services prematurely.

---

## Coordination Primitives

### Deferred: One-Shot Synchronization

A `Promise`-like primitive for signaling between fibers:

```typescript
const pollUntilDone = (taskId: string) =>
  Effect.gen(function* () {
    const done = yield* Deferred.make<Result, Error>();
    yield* pipe(
      checkStatus(taskId),
      Effect.tap((r) => (r.complete ? Deferred.succeed(done, r) : Effect.void)),
      Effect.repeat(Schedule.spaced("2 seconds")),
      Effect.forkScoped,
    );
    return yield* Deferred.await(done);
  }).pipe(Effect.scoped);
```

### Semaphore: Cross-Cutting Concurrency Limits

When `{ concurrency: N }` is insufficient (limits across multiple call sites):

```typescript
const sem = yield * Effect.makeSemaphore(5);
const limited = Effect.forEach(items, (item) => sem.withPermits(1)(processItem(item)));
```

### Queue: Backpressure and Work Distribution

```typescript
// Bounded queue — producers suspend when full
const queue = yield * Queue.bounded<Work>(100);

// Producer
yield * Queue.offer(queue, work);

// Consumer
const work = yield * Queue.take(queue);
```

Queue strategies: `bounded` (backpressure), `dropping` (discard new), `sliding` (discard old), `unbounded`.

---

## Error Handling Under Concurrency

### Parallel Errors Are Never Lost

Effect uses `Cause<E>` to compose errors as a tree:

- `Cause.Parallel(cause1, cause2)` for concurrent failures
- `Cause.Sequential(cause1, cause2)` for both try and finally failing

### Short-Circuiting vs Collecting All

**Default:** First failure interrupts all running effects.

```typescript
// Default: fail-fast (first error stops everything)
yield * Effect.all([a, b, c], { concurrency: "unbounded" });

// Collect all results regardless of failures
yield *
  Effect.all([a, b, c], {
    concurrency: "unbounded",
    mode: "either", // returns Either[] — Right for success, Left for failure
  });

// Or use "validate" mode — returns Option[] for errors
yield *
  Effect.all([a, b, c], {
    concurrency: "unbounded",
    mode: "validate",
  });
```

### Cooperative Interruption

Interruption is asynchronous and cooperative—fibers terminate at safe yield points, never mid-operation. Critical sections use `Effect.uninterruptible`:

```typescript
// Interruption deferred until block completes
yield * Effect.uninterruptible(criticalSection);
```

---

## Choosing Concurrency Level

| Setting          | Risk                      | Best For                              |
| ---------------- | ------------------------- | ------------------------------------- |
| Sequential       | Slow for independent work | Dependent operations, debugging       |
| `concurrency: N` | None if N is well-chosen  | Rate-limited APIs, DB connection caps |
| `"unbounded"`    | Resource exhaustion       | Small, known-size collections         |
| `"inherit"`      | Defaults to unbounded     | Library code, configurable pipelines  |

---

## Common Patterns

### Independent Data Fetches

```typescript
// BEFORE: ~3 seconds sequential
const result = yield * Effect.all([fetchUser, fetchProfile, fetchSettings]);

// AFTER: ~1 second concurrent
const result =
  yield *
  Effect.all([fetchUser, fetchProfile, fetchSettings], {
    concurrency: "unbounded",
  });
```

### Bounded Collection Processing

```typescript
// 10-at-a-time parallelism over large collection
const results =
  yield *
  Effect.forEach(userIds, (id) => fetchUser(id), {
    concurrency: 10,
  });
```

### Graceful Shutdown

```typescript
const server = pipe(
  startHttpServer,
  Effect.fork,
  Effect.tap((fiber) => Effect.addFinalizer(() => Fiber.interrupt(fiber))),
  Effect.scoped,
);
```

---

## Anti-Patterns to Avoid

**Forgetting that `Effect.all` is sequential by default.** Always pass `{ concurrency: "unbounded" }` or `{ concurrency: N }` when effects are independent.

**Using the wrong fork type.** `fork` (dies with parent) vs `forkDaemon` (global) vs `forkScoped` (explicit scope).

**Using `"unbounded"` on large collections.** Exhausts memory, file descriptors, or API rate limits. Prefer `concurrency: N` for unknown-size inputs.

**Missing `yield*` in generators.** Writing `const user = getUserById("123")` instead of `const user = yield* getUserById("123")` assigns the Effect descriptor, not the result.

**Ignoring short-circuiting in concurrent `Effect.all`.** If you need all results regardless of failures, use `{ mode: "either" }`.

---

## Decision Matrix

| Situation                            | Pattern            | Key API                                           |
| ------------------------------------ | ------------------ | ------------------------------------------------- |
| Independent data fetches             | **Effect.all**     | `Effect.all({...}, { concurrency: "unbounded" })` |
| Collection with bounded concurrency  | **Effect.forEach** | `Effect.forEach(items, fn, { concurrency: 10 })`  |
| First-to-succeed wins                | **Effect.race**    | `Effect.race(primary, fallback)`                  |
| Background work (supervised)         | **Fiber**          | `Effect.fork` + `Fiber.join`                      |
| Signal between fibers                | **Deferred**       | `Deferred.make` + `Deferred.await`                |
| Cross-cutting rate limit             | **Semaphore**      | `sem.withPermits(1)(effect)`                      |
| Producer-consumer with backpressure  | **Queue**          | `Queue.bounded` + `offer` + `take`                |
| Collect all results despite failures | **mode: "either"** | `Effect.all([...], { mode: "either" })`           |

---

## Effect Concurrency Checklist

- [ ] **Concurrency is opt-in** — Default is sequential; add `{ concurrency: N }` explicitly
- [ ] **Independent effects run concurrently** — Use `Effect.all` with concurrency for independent work
- [ ] **Bounded concurrency for large collections** — `concurrency: N` prevents resource exhaustion
- [ ] **Correct fork type** — `fork` (supervised), `forkDaemon` (global), `forkScoped` (explicit)
- [ ] **No leaked fibers** — Structured concurrency auto-interrupts children with parent
- [ ] **Parallel errors preserved** — `Cause` tree captures all concurrent failures
- [ ] **Mode for error accumulation** — Use `{ mode: "either" }` when all results needed
- [ ] **Semaphore for cross-cutting limits** — When `concurrency: N` isn't sufficient
- [ ] **Queue for backpressure** — `Queue.bounded` suspends producers when full
