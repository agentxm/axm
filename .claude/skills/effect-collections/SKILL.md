---
name: effect-collections
description: Effect collection patterns - Arrays, Chunks, Records, HashMaps. Use when choosing collection types or working with transformations.
user-invocable: false
---

# Effect Collections

**Use native arrays with Effect's `Array` module for most transformations.** Reserve `Chunk` for repeated concatenation and Streams. Prefer native objects with `Record` module for string-keyed data. Choose `HashMap` only for complex keys or value-based equality.

---

## Array Module: Native Arrays + Effect Utilities

Effect's `Array` module operates on standard JavaScript arrays—zero runtime overhead with composable operations that understand `Option`/`Either`:

```typescript
import { Array, Option, pipe } from "effect";

// filterMap: combined filter + map using Option
const evenSquares = Array.filterMap([1, 2, 3, 4], (x) =>
  x % 2 === 0 ? Option.some(x * x) : Option.none(),
); // [4, 16]

// separate: partitions Either array into [lefts, rights]
const [errors, values] = Array.separate(results);

// getSomes: extracts values from Option array
const defined = Array.getSomes([Option.some(1), Option.none(), Option.some(2)]);
// [1, 2]

// head/last return Option
const first = Array.head(items); // Option<T>
```

### Key Functions Native Methods Don't Provide

| Function                          | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `filterMap`                       | Filter + map with `Option` in one pass     |
| `traverse`                        | Effectful mapping                          |
| `separate`                        | Split `Either[]` into `[lefts, rights]`    |
| `partition`                       | Split by predicate                         |
| `getSomes`/`getLefts`/`getRights` | Extract from wrapped types                 |
| `groupBy`                         | Group into `Record<string, NonEmptyArray>` |
| `head`/`last`                     | Safe access returning `Option`             |

### Composability with Effect

```typescript
// Point-free pipelines
const getActiveNames = flow(
  Array.filter((u: User) => u.active),
  Array.map((u) => u.name),
  Array.take(10),
);

// Effectful iteration
yield * Effect.forEach(users, (user) => Effect.log(`Processing ${user.name}`));

// Array comprehensions with Do
const pairs = pipe(
  Array.Do,
  Array.bind("x", () => [1, 2, 3]),
  Array.bind("y", () => ["a", "b"]),
  Array.map(({ x, y }) => `${x}${y}`),
); // ["1a", "1b", "2a", "2b", "3a", "3b"]
```

---

## Chunk: Only for Repeated Concatenation

`Chunk<T>` is optimized specifically for amortizing repeated concatenation cost—**O(1) amortized** vs O(n) for native arrays. Essential when building collections incrementally; slower than arrays for everything else.

**Benchmark**: Building 100,000 elements via repeated concat: ~52s (native array) vs ~10.7ms (Chunk)—~5000x faster.

```typescript
import { Chunk, Equal } from "effect";

// O(1) concatenation
const combined = Chunk.appendAll(chunk1, chunk2);
const withItem = Chunk.append(chunk, 4);

// Creating
const chunk = Chunk.make(1, 2, 3);
const fromArray = Chunk.fromIterable([1, 2, 3]); // clones
const unsafe = Chunk.unsafeFromArray(array); // no clone—dangerous

// Converting back
const array = Chunk.toReadonlyArray(chunk);

// Built-in structural equality
Equal.equals(chunk1, chunk2);
```

### When to Use Chunk

| Use Chunk                                  | Use Native Arrays                         |
| ------------------------------------------ | ----------------------------------------- |
| Building collections with repeated concat  | Simple one-time transformations           |
| Working with Streams (`runCollect`)        | Small arrays                              |
| Batches combined repeatedly                | Interfacing with external APIs            |
| Concurrent contexts (guaranteed immutable) | Performance-critical paths without concat |

---

## Record Module: Native Objects + Effect Utilities

Like `Array`, the `Record` module operates on native JavaScript objects without wrapping:

```typescript
import { Record, Option, pipe } from "effect";

// Safe access returning Option
const port = Record.get(config, "port"); // Option<number>

// Functional transformations (return new objects)
const doubled = Record.map(scores, (n) => n * 2);
const filtered = Record.filter(config, (v) => v !== null);
const asArray = Record.collect(users, (id, user) => `${id}: ${user.name}`);

// Creating from iterables
const byId = Record.fromIterableBy(users, (user) => user.id);
const fromPairs = Record.fromEntries([
  ["a", 1],
  ["b", 2],
]);

// Set operations
const merged = Record.union(defaults, overrides, (a, b) => b);
const common = Record.intersection(obj1, obj2, (a, b) => a + b);
```

---

## HashMap: Complex Keys and Value Equality

`HashMap<K, V>` supports **any key type** and compares keys by **value** when using `Data.struct`:

```typescript
import { HashMap, Data, Equal } from "effect";

// Complex object keys with value-based equality
const key1 = Data.struct({ x: 1, y: 2 });
const key2 = Data.struct({ x: 1, y: 2 });

const map = HashMap.make([key1, "first"], [key2, "second"]);
HashMap.size(map); // 1—keys equal by value, second overwrites first

// Immutable operations
const updated = HashMap.set(map, key1, "updated");
const removed = HashMap.remove(map, key1);

// Safe access
const value = HashMap.get(map, key1); // Option<string>

// Batch mutations for performance
const efficient = HashMap.mutate(HashMap.empty(), (draft) => {
  HashMap.set(draft, "a", 1);
  HashMap.set(draft, "b", 2);
});
```

### HashMap vs Native Objects

| Feature            | Native Objects + Record | HashMap                          |
| ------------------ | ----------------------- | -------------------------------- |
| Key types          | `string \| symbol` only | Any type with `Hash` + `Equal`   |
| Key equality       | Reference-based         | Value-based (with `Data.struct`) |
| Mutability         | Mutable by default      | Immutable (runtime enforced)     |
| JSON serialization | Direct                  | Requires conversion              |
| Performance        | V8-optimized            | HAMT-based, slight overhead      |

---

## Decision Framework

### Array vs Chunk

| Scenario                             | Use                                      |
| ------------------------------------ | ---------------------------------------- |
| Simple transforms (map, filter)      | Native arrays + `Array` module           |
| Working with Option/Either in arrays | `Array` module (`filterMap`, `getSomes`) |
| Building with repeated concat        | **Chunk**                                |
| Stream processing                    | **Chunk** (native to Streams)            |
| JSON serialization, external APIs    | Native arrays                            |

### Record vs HashMap

| Scenario                          | Use                              |
| --------------------------------- | -------------------------------- |
| String-keyed config/data          | Native objects + `Record` module |
| Functional transforms on objects  | `Record` module                  |
| Complex object keys               | **HashMap** with `Data.struct`   |
| Value-based key equality          | **HashMap**                      |
| JSON serialization, external APIs | Native objects                   |

### Default Approach

1. **Start with native types** + Effect's Array/Record modules
2. **Introduce Chunk** only for concat performance issues or Streams
3. **Introduce HashMap** only for non-string keys or value equality
4. **Convert at boundaries**: native types at API edges

---

## Readonly Types

Effect provides type aliases that signal immutability at the type level. Use these in function signatures and type definitions.

### Type Equivalences

| Effect Type                  | Equivalent To              | Notes                            |
| ---------------------------- | -------------------------- | -------------------------------- |
| `Array.Array<T>`             | `ReadonlyArray<T>`         | Same type, re-exported by Effect |
| `readonly T[]`               | `ReadonlyArray<T>`         | TypeScript shorthand             |
| `Record.ReadonlyRecord<K,V>` | `{ readonly [P in K]: V }` | Effect's readonly record type    |

### Usage Guidelines

```typescript
import { Array, Record } from "effect";

// Prefer Effect's type aliases in signatures
interface UserState {
  readonly users: Array.Array<User>; // = ReadonlyArray<User>
  readonly byId: Record.ReadonlyRecord<string, User>; // readonly string-keyed
}

// Function signatures signal immutability
const processUsers = (users: Array.Array<User>): Array.Array<ProcessedUser> =>
  Array.map(users, transform);

// All three are equivalent for arrays:
type A = Array.Array<string>; // Effect alias (preferred)
type B = ReadonlyArray<string>; // TypeScript built-in
type C = readonly string[]; // TypeScript shorthand
```

### Immutable by Design

`Chunk` and `HashMap` are **already immutable**—no readonly variants needed:

```typescript
// Chunk operations always return new Chunks
const chunk2 = Chunk.append(chunk1, item); // chunk1 unchanged

// HashMap operations always return new HashMaps
const map2 = HashMap.set(map1, key, value); // map1 unchanged
```

---

## Schema Integration

```typescript
import { Schema } from "effect";

// Array schemas
const UserList = Schema.Array(
  Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
  }),
);

// Record schemas
const ScoreMap = Schema.Record({ key: Schema.String, value: Schema.Number });

// HashMap schemas
const HashMapSchema = Schema.HashMap({
  key: Schema.String,
  value: Schema.Number,
});
```

---

## Effect Collections Checklist

- [ ] **Default to native types** — Arrays and objects with Effect modules
- [ ] **Chunk for concat only** — Building incrementally or working with Streams
- [ ] **HashMap for complex keys** — Non-string keys or value-based equality
- [ ] **Convert at boundaries** — Native types for external APIs, JSON
- [ ] **Use Array utilities** — `filterMap`, `getSomes`, `separate` for Option/Either
- [ ] **Use Record utilities** — `get`, `filterMap`, `collect` for object transforms
- [ ] **Readonly types** — `Array.Array<T>` and `Record.ReadonlyRecord<K,V>` in signatures
