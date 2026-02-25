---
name: effect-iteration
description: Effect iteration patterns - forEach, all, Schedule. Use when writing for/while loops, processing collections, seeing `for` or `while` with `yield*`, or implementing retries/polling.
user-invocable: false
---

# Effect Iteration

**Choose the right iteration tool based on whether effects are involved and whether you need concurrency.** Plain loops for pure synchronous work; `Effect.forEach` and `Effect.all` for effectful iteration over known collections; `Schedule` for temporal patterns like retries and polling.

For lazy, unbounded, or resource-scoped sequences, see /effect-stream.

---

## Plain Loops for Pure, Synchronous Work

**Pure, synchronous transformations over materialized data should use plain JavaScript iteration.** The callbacks passed to `Effect.sync`, `Effect.map`, and `Effect.flatMap` are ordinary synchronous functions.

```typescript
// ✅ Plain Array.map inside Effect.map—no effects involved
const doubled = Effect.map(fetchNumbers(), (nums) => nums.map((n) => n * 2));

// ✅ Effect.sync wrapping a synchronous loop
const logAll = Effect.sync(() => {
  for (const item of items) {
    console.log(item);
  }
});
```

**Performance matters.** The Effect docs warn that generators and iterables carry overhead unsuitable for hot collection transforms. When mapping, filtering, or reducing an in-memory array with zero effectful operations, a plain loop outperforms any Effect-wrapped equivalent.

**Decision criterion:** If the transformation per element is pure and synchronous—no I/O, no failures to track, no concurrency—use a traditional loop.

---

## Effect.forEach: Effectful Iteration Over Collections

`Effect.forEach` applies an effectful operation to each element of a collection:

```typescript
const result = Effect.forEach([1, 2, 3, 4, 5], (n, index) =>
  Console.log(`Currently at index ${index}`).pipe(Effect.as(n * 2)),
);
// Result: Effect<number[], never, never>
// Output: [2, 4, 6, 8, 10]
```

### Options

| Option                 | Values                               | Behavior                                           |
| ---------------------- | ------------------------------------ | -------------------------------------------------- |
| `concurrency`          | `number \| "unbounded" \| "inherit"` | Controls parallel execution; default is sequential |
| `batching`             | `boolean \| "inherit"`               | Enables request batching                           |
| `discard`              | `boolean`                            | Discards results (returns `void` instead of `B[]`) |
| `concurrentFinalizers` | `boolean`                            | Scope finalizers run concurrently on cleanup       |

**For side-effect-only iteration, always pass `{ discard: true }`** to avoid accumulating a results array.

### Error Handling

**Fail-fast by default.** Sequential combinators stop and return immediately on the first error. With concurrency, a failure **interrupts all in-flight effects** and propagates the error.

---

## Effect.all: Combining Heterogeneous Effects

`Effect.all` combines **already-constructed effects**, preserving input shape:

```typescript
// Tuple input → tuple result
const result = Effect.all([Effect.succeed(42), Effect.succeed("hello")] as const);
// Type: Effect<[number, string], never, never>

// Struct input → struct result
const result2 = Effect.all({
  count: Effect.succeed(42),
  name: Effect.succeed("hello"),
});
// Type: Effect<{ count: number; name: string }, never, never>
```

### Error Accumulation Modes

- **`{ mode: "either" }`** — All effects run; results are `Either[]`
- **`{ mode: "validate" }`** — All effects run; failures collected as `Option[]`

**Use `Effect.all`** for a fixed, potentially heterogeneous set of effects.
**Use `Effect.forEach`** for a collection of data with a single effectful function.

---

## Sequential by Default—Not Like Promise.all

Unlike `Promise.all` which runs concurrently, **`Effect.all` and `Effect.forEach` default to sequential execution.**

```typescript
// Sequential (default)
const results = yield * Effect.forEach(items, processItem);

// Concurrent with limit
const results = yield * Effect.forEach(items, processItem, { concurrency: 5 });

// Unbounded concurrency (like Promise.all)
const results = yield * Effect.forEach(items, processItem, { concurrency: "unbounded" });

// Inherit from context
const process = Effect.forEach(items, handler, { concurrency: "inherit" });
const fast = process.pipe(Effect.withConcurrency(10));
const gentle = process.pipe(Effect.withConcurrency(2));
```

---

## for...of Inside Effect.gen

Inside an `Effect.gen` generator, standard JavaScript control flow works with `yield*`:

```typescript
// ⚠️ ANTI-PATTERN: for + yield* + push = missed parallelization
const processItems = (items: number[]) =>
  Effect.gen(function* () {
    const results: number[] = [];
    for (const item of items) {
      const result = yield* someEffectfulOperation(item);
      results.push(result);
    }
    return results;
  });

// ✅ BETTER: Effect.forEach enables concurrency and is immutable
const processItems = (items: number[]) =>
  Effect.forEach(items, (item) => someEffectfulOperation(item), {
    concurrency: "unbounded",
  });
```

**The pattern `for` + `yield*` + `push` is a code smell.** If the effectful operations are independent, you're missing parallelization opportunities.

**Only use `for...of` with `yield*` when:**

- Loop body has **complex branching** or **early breaks**
- Iterations **depend on previous results** (must be sequential)
- You need **intermediate state** across iterations

**Default to `Effect.forEach`** — it's cleaner, immutable, and concurrency-ready.

---

## Effect.loop and Effect.iterate: Stateful Loops

`Effect.loop` provides a `while`-loop with effectful body:

```typescript
// Effect.loop: collects intermediate results
const countdown = Effect.loop(5, {
  while: (n) => n > 0,
  step: (n) => n - 1,
  body: (n) => Effect.succeed(n),
});
// Result: [5, 4, 3, 2, 1]

// Effect.iterate: returns only final state
const finalState = Effect.iterate(0, {
  while: (n) => n < 10,
  body: (n) => Effect.succeed(n + 1),
});
// Result: 10
```

Use `Effect.loop` when collecting results. Use `Effect.iterate` for state-machine patterns.

---

## Schedule: Temporal Patterns

`Schedule` describes recurring temporal patterns for `Effect.repeat` (success-driven) and `Effect.retry` (failure-driven):

### Built-In Schedules

| Schedule                     | Behavior                                      |
| ---------------------------- | --------------------------------------------- |
| `Schedule.spaced(duration)`  | Fixed delay from end of last execution        |
| `Schedule.fixed(interval)`   | Fixed interval from start (prevents pile-ups) |
| `Schedule.exponential(base)` | Exponential backoff (base × 2^n)              |
| `Schedule.recurs(n)`         | Limits total recurrences                      |

### Composing Schedules

```typescript
// Exponential backoff with jitter, capped at 5 retries
const policy = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(5)),
);
const resilient = Effect.retry(httpCall, policy);
```

Schedules compose via:

- `union` — continue if _either_ wants to
- `intersect` — continue only if _both_ want to
- `andThen` — sequence two schedules

**Use `Schedule` for temporal iteration**—polling, retrying, periodic tasks.
**Use `Effect.loop`/`Effect.iterate` for computational iteration** with no delays.

---

## Semaphore for Cross-Call-Site Rate Limiting

When `{ concurrency: N }` is insufficient:

```typescript
const sem = yield * Effect.makeSemaphore(5);
const limited = Effect.forEach(items, (item) => sem.withPermits(1)(processItem(item)));
```

---

## Anti-Patterns to Avoid

**`for` + `yield*` + `push` when operations are independent.** This misses parallelization:

```typescript
// ❌ Sequential, mutable, slow
const results: T[] = [];
for (const item of items) {
  const result = yield * processItem(item); // I/O operation
  results.push(result);
}

// ✅ Concurrent, immutable, fast
const results =
  yield *
  Effect.forEach(items, (item) => processItem(item), {
    concurrency: "unbounded",
  });
```

**Using `Promise.all` or `async`/`await` inside Effect pipelines.** Wrap Promise-based APIs at the boundary with `Effect.tryPromise`.

**Forgetting concurrency options.** `Effect.all` and `Effect.forEach` are sequential by default—add `{ concurrency: N }` when needed.

**Mixing imperative mutation with concurrent Effects.** Use `Ref` for atomic shared state.

**Forgetting error channel propagation.** `items.map(effectfulFn)` produces an array of unexecuted effects—combine with `Effect.all` or use `Effect.forEach`.

---

## Decision Matrix

| Situation                                     | Pattern              | Key API                                    |
| --------------------------------------------- | -------------------- | ------------------------------------------ |
| Pure sync transform of in-memory array        | **Plain JS loop**    | `Array.map`, `for...of`, `reduce`          |
| Effectful operation per element, finite       | **Effect.forEach**   | `Effect.forEach(items, fn)`                |
| Combine fixed set of heterogeneous effects    | **Effect.all**       | `Effect.all({ a, b, c })`                  |
| Complex control flow (early break, branching) | **Effect.gen + for** | `yield*` inside `for...of`                 |
| Stateful loop with effectful body             | **Effect.loop**      | `Effect.loop(init, { while, step, body })` |
| Retry with backoff / periodic polling         | **Schedule**         | `Effect.retry(e, Schedule.exponential())`  |
| Lazy, unbounded, or resource-scoped sequences | **Stream**           | See /effect-stream                         |

---

## Effect Iteration Checklist

- [ ] **Pure transforms use plain loops** — No Effect overhead for synchronous work
- [ ] **Effect.forEach for effectful iteration** — With typed errors and optional concurrency
- [ ] **No `for` + `yield*` + `push`** — Use Effect.forEach instead; exception: complex control flow
- [ ] **Effect.all for heterogeneous effects** — Preserves tuple/struct shape
- [ ] **Concurrency is opt-in** — Default is sequential; add `{ concurrency: N }` explicitly
- [ ] **No Promise.all** — Use Effect combinators for structured concurrency
- [ ] **Discard when side-effect-only** — `{ discard: true }` avoids array allocation
- [ ] **Schedule for temporal patterns** — Retries, polling, periodic tasks
- [ ] **Stream for lazy/unbounded** — See /effect-stream for that use case
