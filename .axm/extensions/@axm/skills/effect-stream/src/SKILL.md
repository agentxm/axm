---
name: effect-stream
description: Effect Stream for lazy, unbounded, or resource-scoped sequences. Use when data is paginated, infinite, or needs backpressure.
user-invocable: false
---

# Effect Stream

**`Stream<A, E, R>` is a pull-based, lazy description of a program that emits zero or more values.** Where `Effect<A, E, R>` always produces exactly one value, `Stream` handles finite, infinite, or empty sequences with inherent laziness and backpressure.

For finite, materialized collections, see /effect-iteration.

---

## When to Use Stream

| Use Stream when...                          | Use Effect.forEach when...           |
| ------------------------------------------- | ------------------------------------ |
| Data is fetched lazily (pagination, cursor) | Collection is already in memory      |
| Sequence is potentially infinite            | Size is known and bounded            |
| Processing needs backpressure               | All results needed before continuing |
| Resources must be scoped to iteration       | No resource lifecycle concerns       |
| Multi-stage transformation pipeline         | Simple one-pass processing           |

---

## Creating Streams

### From Existing Data

```typescript
// From iterable (zero-cost wrapping)
const stream = Stream.fromIterable([1, 2, 3]);

// From single effect
const stream = Stream.fromEffect(fetchUser(id));

// From chunk
const stream = Stream.fromChunk(chunk);
```

### Lazy Generation

```typescript
// Paginated API with unfoldEffect
const pages = Stream.unfoldEffect(firstPageToken, (token) =>
  fetchPage(token).pipe(
    Effect.map((page) =>
      page.nextToken ? Option.some([page.data, page.nextToken] as const) : Option.none(),
    ),
  ),
);

// Infinite sequence (safe—only consumed elements computed)
const naturals = Stream.iterate(1, (n) => n + 1);
const firstFive = naturals.pipe(Stream.take(5));

// Repeated effect
const heartbeats = Stream.repeatEffect(ping());
```

---

## Stream Operations

### Transformations

```typescript
const pipeline = Stream.fromIterable(rawEvents).pipe(
  Stream.filter((e) => e.type === "purchase"),
  Stream.map((e) => ({ userId: e.userId, amount: e.amount })),
  Stream.mapEffect((e) => enrichWithUserData(e)),
);
```

### Concurrent Processing

`Stream.mapEffect` accepts concurrency options:

```typescript
Stream.fromIterable(urls).pipe(Stream.mapEffect((url) => fetchUrl(url), { concurrency: 5 }));

// Unordered for higher throughput (results as they complete)
Stream.mapEffect((url) => fetchUrl(url), { concurrency: 5, unordered: true });
```

### Batching

```typescript
// Fixed-size batches
const batched = stream.pipe(Stream.grouped(100));

// Time-windowed batches (by count OR time, whichever first)
const microBatched = stream.pipe(
  Stream.groupedWithin(100, "5 seconds"),
  Stream.mapEffect((batch) => insertBatch(batch)),
);
```

### Early Termination

```typescript
// Stop before failing element
const until100 = Stream.iterate(0, (n) => n + 1).pipe(
  Stream.takeWhile((n) => n < 100), // emits 0..99
);

// Stop after matching element
const untilDone = stream.pipe(Stream.takeUntil((msg) => msg.type === "done"));
```

### Merging Streams

```typescript
// Concurrent interleaving
const merged = Stream.merge(stream1, stream2);

// Halt strategies: "both" (default), "either", "left", "right"
const merged = Stream.merge(stream1, stream2, { haltStrategy: "either" });

// Merge many streams
const all = Stream.mergeAll([s1, s2, s3], { concurrency: 3 });
```

---

## Backpressure and Buffering

Pull-based model provides **inherent backpressure**: slow consumer throttles producer.

For decoupling producer/consumer speeds:

```typescript
const buffered = Stream.range(1, 10000).pipe(
  Stream.mapEffect(processItem),
  Stream.buffer({ capacity: 64 }), // producer pauses when buffer fills
);
```

---

## Resource-Scoped Iteration

`Stream.acquireRelease` ties element production to resource lifecycles:

```typescript
const rows = Stream.acquireRelease(openDatabaseConnection(), (conn) => conn.close()).pipe(
  Stream.flatMap((conn) => Stream.fromIterable(conn.queryIterator("SELECT * FROM users"))),
);
// Connection released after consumption ends, even on failure
```

Other resource patterns:

```typescript
// Single-valued stream from scoped resource
const scoped = Stream.scoped(acquireScopedResource());

// Attach cleanup to stream termination
const withCleanup = stream.pipe(Stream.ensuring(Effect.log("Stream finished")));
```

---

## Consuming Streams

| Method                             | Use When                              |
| ---------------------------------- | ------------------------------------- |
| `Stream.runCollect(stream)`        | Need full result set (bounded only!)  |
| `Stream.runForEach(stream, fn)`    | Side-effect processing, no collection |
| `Stream.runFold(stream, init, fn)` | Aggregation without materialization   |
| `Stream.runDrain(stream)`          | Run for effects only, discard values  |
| `Stream.run(stream, sink)`         | Custom consumption via `Sink`         |

**`Stream.runCollect` materializes the entire stream into a `Chunk`.** Use only for bounded streams. For side-effect processing, prefer `Stream.runForEach`.

```typescript
// Collect bounded stream
const items = yield * Stream.runCollect(stream);
const array = Chunk.toReadonlyArray(items);

// Process without collecting
yield * Stream.runForEach(stream, (item) => processItem(item));

// Fold to aggregate
const sum = yield * Stream.runFold(stream, 0, (acc, n) => acc + n);
```

---

## Chunk: Stream's Native Collection

`Chunk<A>` is optimized for repeated concatenation—the pattern inside Stream pipelines. You'll encounter it as the return type of `Stream.runCollect`.

```typescript
// Stream.runCollect returns Chunk
const chunk = yield * Stream.runCollect(stream);

// Convert to array when needed
const array = Chunk.toReadonlyArray(chunk);
```

For general collection guidance, see /effect-collections.

---

## Anti-Patterns to Avoid

**Over-abstracting with Stream for small arrays.** If you have 10 items in memory, `Effect.forEach(items, callApi, { concurrency: 5 })` is simpler than `Stream.fromIterable(items).pipe(Stream.mapEffect(callApi), Stream.runCollect)`.

**Collecting entire Stream unnecessarily.** Calling `Stream.runCollect` on 10 million rows defeats the purpose. Use `Stream.runForEach` or `Stream.runFold`.

**Forgetting to consume.** A Stream is a description—it does nothing until you run it.

---

## Decision Matrix

| Situation                               | Pattern                         | Key API                        |
| --------------------------------------- | ------------------------------- | ------------------------------ |
| Paginated API / database cursor         | **Stream.unfoldEffect**         | Lazy page fetching             |
| Infinite or unbounded sequence          | **Stream.iterate/repeatEffect** | Pull-based, safe to define     |
| Multi-stage transform pipeline          | **Stream operators**            | `map` → `filter` → `mapEffect` |
| Resource-scoped iteration               | **Stream.acquireRelease**       | Guaranteed cleanup             |
| Concurrent processing with backpressure | **Stream.mapEffect**            | `{ concurrency: N }`           |
| Time-windowed batching                  | **Stream.groupedWithin**        | Count OR time trigger          |
| Merging event sources                   | **Stream.merge/mergeAll**       | Concurrent interleaving        |
| Known finite collection                 | **Effect.forEach**              | See /effect-iteration          |

---

## Effect Stream Checklist

- [ ] **Stream for lazy data** — Pagination, cursors, infinite sequences
- [ ] **Stream for backpressure** — Producer/consumer flow control
- [ ] **Stream for resources** — `acquireRelease` scopes cleanup to consumption
- [ ] **runForEach over runCollect** — Avoid materializing unless needed
- [ ] **groupedWithin for batching** — Time-windowed micro-batches
- [ ] **Don't over-use Stream** — Effect.forEach is simpler for finite collections
- [ ] **Consume the stream** — Streams do nothing until run
