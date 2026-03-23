---
name: effect-option
description: Option vs nullable types in Effect. Use when handling optional, nullable, or potentially undefined properties.
user-invocable: false
---

# Option vs Nullable Types in Effect

**Use `Option<T>` as the default for optional values within Effect codebases.** Reserve nullable types (`T | null | undefined`) for interop boundaries with external APIs, DOM operations, and JSON serialization.

---

## When to Use Option

- Modeling domain entities with optional properties
- Functions where absence is a valid, expected outcome (partial functions)
- Chaining transformations where any step might produce absence
- Distinguishing "not found" from actual errors (return `Effect<Option<A>, E>`)
- Working entirely within Effect ecosystem code
- Exhaustiveness checking on absence handling

```typescript
// Domain modeling: explicit absence
interface User {
  email: Option<string>; // "may not have provided" vs "not loaded yet"
}

// Distinguishing absence from error
const findUser = (id: string): Effect.Effect<Option<User>, DatabaseError> =>
  // Some(user) = found, None = not found, DatabaseError = actual error
```

---

## When to Use Nullable Types

- Interfacing with DOM APIs, external libraries, or database drivers
- Serializing to JSON where `null` vs `undefined` semantics matter
- Writing interop layers consumed by non-Effect code
- Performance-critical hot paths (measure first)
- Optional function parameters where `param?: T` syntax is clearer

---

## Conversion at Boundaries

Convert eagerly with the boundary helper that matches the incoming shape, then
return to nullable values only at the edge:

```typescript
// Incoming: choose the helper that matches the source value
const userOption = Option.fromNullOr(externalApi.getUser());
const themeOverride = Option.fromUndefinedOr(process.env.AXM_THEME);

// Work with Option throughout
const result = pipe(
  userOption,
  Option.map((u) => u.preferences),
  Option.flatMap((p) => Option.fromUndefinedOr(p.theme)),
  Option.filter((theme) => theme !== "system"),
  Option.getOrElse(() => "dark"),
);

// Outgoing: convert at the edge
const response = { theme: Option.getOrNull(themeOption) };
```

### Conversion Reference

| From              | To                    | Method                     |
| ----------------- | --------------------- | -------------------------- |
| `T \| null`       | `Option<T>`           | `Option.fromNullOr()`      |
| `T \| undefined`  | `Option<T>`           | `Option.fromUndefinedOr()` |
| `T \| nullish`    | `Option<T>`           | `Option.fromNullishOr()`   |
| `Option<T>`       | `T \| null`           | `Option.getOrNull()`       |
| `Option<T>`       | `T \| undefined`      | `Option.getOrUndefined()`  |
| `() => T \| null` | `(a: A) => Option<T>` | `Option.liftNullable()`    |

---

## Schema Transformations for APIs

```typescript
// REST API with null for absence
Schema.OptionFromNullOr(Schema.String); // null ↔ None

// JavaScript-style undefined
Schema.OptionFromUndefinedOr(Schema.String); // undefined ↔ None

// APIs using both
Schema.OptionFromNullishOr(Schema.String); // null | undefined ↔ None
```

---

## Composing with Option

### Chaining Transformations

```typescript
pipe(
  Option.fromNullOr(user),
  Option.map((u) => u.preferences),
  Option.flatMap((p) => Option.fromUndefinedOr(p.theme)),
  Option.filter((theme) => theme !== "system"),
  Option.getOrElse(() => "dark"),
);
```

### Generator Syntax

```typescript
const result = Option.gen(function* () {
  const user = yield* Option.fromNullOr(maybeUser);
  const prefs = yield* Option.fromUndefinedOr(user.preferences);
  return prefs.theme;
});
```

### Working with Arrays

```typescript
import { Array, Option, pipe } from "effect";

// filterMap: combines filter + transform
const updated = Array.filterMap(skills, (s) =>
  Option.map(s.locked, (locked) => ({ ...s, version: locked.version })),
);

// getSomes: extracts values from Option array
const lockedSkills = Array.getSomes(Array.map(skills, (s) => s.locked));
```

---

## Pattern Matching

```typescript
// Exhaustive handling with match
Option.match(userOption, {
  onNone: () => "Anonymous",
  onSome: (user) => user.displayName,
});

// Type guards for narrowing
if (Option.isSome(opt)) {
  opt.value; // narrowed to Some<A>
}

// Default values
Option.getOrElse(() => fallback); // lazy evaluation
Option.getOrThrow(opt); // escape hatch when invariant guaranteed
```

---

## Lifting into Effect

```typescript
// Option to Effect with typed error
Effect.fromOption(opt).pipe(Effect.mapError(() => new NotFoundError()));

// Effect<Option<A>> for recoverable absence
const findUser = (id: string): Effect.Effect<Option<User>, DbError> =>
  Effect.gen(function* () {
    const result = yield* db.query(id);
    return Option.fromNullishOr(result);
  });
```

---

## Effect Optional Checklist

- [ ] **Option for domain models** — Optional properties use `Option<T>`
- [ ] **Convert at boundaries** — Use `fromNullOr` / `fromUndefinedOr` / `fromNullishOr` at entry, `getOrNull` / `getOrUndefined` at exit
- [ ] **Schema transformations** — Use `OptionFromNullOr` for API contracts
- [ ] **Distinguish absence from error** — `Effect<Option<A>, E>` for "not found"
- [ ] **Exhausitve handling** — Use `Option.match` for both cases
- [ ] **Nullable for interop** — External APIs, JSON serialization, DOM
- [ ] **Array utilities** — `filterMap`, `getSomes` for Option arrays
