---
status: active
last-reviewed: 2026-04-03
version: 0.2.0
description: Assertion-free TypeScript, narrowing, and immutability
depends-on: []
---

# TypeScript Style Guide

Strict, idiomatic TypeScript conventions for `axm`. Covers type annotations,
narrowing, assertions, immutability, and common patterns. It complements the
repo-wide rules in AGENTS.md and CLAUDE.md and focuses on why those rules matter
in day to day code.

Does not cover Effect-specific patterns (see [Effect Guide](./effect.md)) or
testing conventions (see [Testing Guide](./testing.md)).

> [TypeScript](../../CLAUDE.md#typescript) - duplicate agent copy

## Key Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - Language
  reference
- [Effect Guide](./effect.md) - Effect-specific patterns used in this repo
- [Effect Option Guide](./effect-option.md) - Option versus nullable guidance

---

## Type Annotations

TypeScript's inference is powerful — use it for local values and let explicit
types document boundaries. Over-annotating creates noise and fights the compiler
instead of leveraging it.

### Examples

```typescript
// Good: inferred local — type is obvious from the initializer
const name = "axm";
const items = [1, 2, 3];

// Good: explicit parameter types, inferred return
function greet(name: string) {
  return `Hello, ${name}`;
}

// Good: explicit return type at a published package boundary
export function parseConfig(raw: unknown): Config {
  return Schema.decodeUnknownSync(ConfigSchema)(raw);
}

// Good: schema-derived type instead of hand-written interface
class ConfigSchema extends Schema.Class<ConfigSchema>("ConfigSchema")({
  name: Schema.String,
  version: Schema.String,
}) {}
type Config = typeof ConfigSchema.Type;

// Bad: noisy annotation on an obvious local
const name: string = "axm";

// Bad: hand-written interface duplicating a schema
interface Config {
  name: string;
  version: string;
}
```

### Type Annotations Checklist

- [ ] **Infer locals** — Omit type annotations on `const`/`let` when the
      initializer makes the type obvious
- [ ] **Annotate exports** — All exported functions, constants, and class
      members have explicit return/type annotations at published package
      boundaries
- [ ] **Annotate parameters** — Function parameters always have explicit types
- [ ] **Schema-derived types** — Prefer types derived from schemas
      (`Schema.Type`, `Schema.Class`) over hand-written interfaces for validated
      data
- [ ] **Let Effect infer** — Let Effect infer return types unless a public API
      or recursive function needs an explicit annotation

---

## Type Assertions

Type assertions (`as`, `!`, `as unknown as`) bypass the compiler. They hide bugs
and rot silently when surrounding code changes. Every assertion is a promise the
compiler cannot verify.

### Examples

```typescript
// Bad: as cast hides a potential mismatch
const config = JSON.parse(raw) as Config;

// Good: validate with Schema
const config = Schema.decodeUnknownSync(ConfigSchema)(JSON.parse(raw));

// Bad: non-null assertion — crashes at runtime if null
const el = document.getElementById("root")!;

// Good: explicit null check
const el = document.getElementById("root");
if (el == null) {
  throw new Error("Root element not found");
}

// Good: satisfies constrains while preserving inference
const defaults = {
  retries: 3,
  timeout: 5000,
} satisfies Partial<Options>;

// Good: as const narrows to literal types
const MODES = ["install", "uninstall", "update"] as const;
```

### Type Assertions Checklist

- [ ] **No `as` casts** — Never use `as` to coerce types; narrow, validate, or
      redesign instead
- [ ] **No non-null assertions** — Never use `!` postfix; use nullish checks,
      optional chaining, or `?? throw`
- [ ] **No double-casts** — Never use `as unknown as T`
- [ ] **`satisfies` over `as`** — Use `satisfies` to constrain a value while
      preserving inference
- [ ] **`as const` permitted** — `as const` is allowed; it narrows literals, it
      does not erase types

---

## Narrowing

Narrowing is how you prove types to the compiler without lying. Prefer patterns
that make the type system do the work.

### Examples

```typescript
// Discriminated union — compiler narrows automatically
type Result =
  { readonly _tag: "Ok"; readonly value: string } | { readonly _tag: "Err"; readonly error: Error };

function handle(r: Result) {
  switch (r._tag) {
    case "Ok":
      return r.value; // string
    case "Err":
      throw r.error; // Error
  }
}

// Exhaustiveness — never allows the compiler to catch unhandled cases
function exhaustive(r: Result) {
  switch (r._tag) {
    case "Ok":
      return r.value;
    case "Err":
      throw r.error;
    default:
      return r satisfies never;
  }
}

// Type guard — named predicate for reusable narrowing
function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

// Control-flow narrowing — one-off null check
function getLength(value: string | undefined): number {
  if (value == null) {
    return 0;
  }
  return value.length; // narrowed to string
}
```

### Narrowing Checklist

- [ ] **Discriminated unions** — Use a `_tag` or `kind` literal field for
      variant types
- [ ] **Exhaustiveness checks** — `switch` over discriminants uses
      `satisfies never` or `never` assignment in the default branch
- [ ] **Type guards** — Reusable narrowing logic uses `value is T` predicates
- [ ] **Control flow narrowing** — Prefer `if`/`switch`/`in` checks over manual
      type predicates when one-off
- [ ] **Null handling** — Use optional chaining (`?.`), nullish coalescing
      (`??`), or explicit checks — never `!`
- [ ] **Option in Effect code** — In Effect pipelines, prefer `Option<T>` over
      nullable types for semantic absence; see
      [Effect Option Guide](./effect-option.md) for when to use each

---

## `unknown` Over `any`

`any` disables the type system. It propagates silently and infects surrounding
code. `unknown` forces the consumer to narrow before use.

### Examples

```typescript
// Bad: any disables all checking
function parse(input: any) {
  return input.name; // no error, no safety
}

// Good: unknown forces narrowing
function parse(input: unknown) {
  return Schema.decodeUnknownSync(ConfigSchema)(input);
}

// Bad: any as a generic default
function wrap<T = any>(value: T): Box<T> {
  return { value };
}

// Good: unknown as a generic default
function wrap<T = unknown>(value: T): Box<T> {
  return { value };
}
```

### `unknown` Checklist

- [ ] **No `any`** — Never use `any` in new code
- [ ] **`unknown` at boundaries** — External input (API responses, parsed JSON,
      user input) is typed `unknown`
- [ ] **Narrow before use** — `unknown` values are decoded or narrowed to
      concrete types before reaching domain logic
- [ ] **No `any` in generics** — Prefer `unknown` or a constrained type
      parameter over `any` as a generic default

---

## Readonly and Immutability

Immutable data prevents accidental mutation and makes code easier to reason
about. Handlers and services stay predictable under refactor and concurrency.

### Examples

```typescript
// Good: readonly properties
interface Config {
  readonly name: string;
  readonly version: string;
}

// Good: ReadonlyArray for arrays that should not be mutated
function first(items: ReadonlyArray<string>): string | undefined {
  return items[0];
}

// Good: as const for constant lookup tables
const STATUS_CODES = {
  ok: 200,
  notFound: 404,
  error: 500,
} as const;

// Bad: mutating a parameter
function addItem(items: string[], item: string) {
  items.push(item); // mutates caller's array
  return items;
}

// Good: returning a new array
function addItem(items: ReadonlyArray<string>, item: string): ReadonlyArray<string> {
  return [...items, item];
}
```

### Immutability Checklist

- [ ] **`readonly` properties** — Interface and type properties are `readonly`
      unless mutation is intentional
- [ ] **`ReadonlyArray`** — Prefer `readonly T[]` or `ReadonlyArray<T>` for
      arrays that should not be mutated
- [ ] **`as const` for literals** — Use `as const` for constant objects and
      tuples to get narrow literal types
- [ ] **No parameter mutation** — Functions do not mutate their arguments

---

## Misc

### Examples

```typescript
// No enums — use as const objects or string literal unions
// Bad
enum Status {
  Active = "active",
  Inactive = "inactive",
}

// Good
const Status = {
  Active: "active",
  Inactive: "inactive",
} as const;
type Status = (typeof Status)[keyof typeof Status];

// Good: string literal union
type Status = "active" | "inactive";

// Branded types for domain IDs
type UserId = string & Brand.Brand<"UserId">;
type TeamId = string & Brand.Brand<"TeamId">;

function getUser(id: UserId) {
  /* ... */
}
const userId = Brand.nominal<UserId>()("u_123");
getUser(userId); // ok
// getUser(teamId); // compile error — prevents accidental mixing

// Template literal types for structured string patterns
type EventName = `${string}.${"created" | "updated" | "deleted"}`;
const event: EventName = "user.created"; // ok
// const bad: EventName = "user.archived"; // compile error
```

### Misc Checklist

- [ ] **Strict mode** — `strict: true` in `tsconfig.json`; never disable
      individual strict flags
- [ ] **No enums** — Use `as const` objects or string literal unions instead of
      `enum`
- [ ] **No `namespace`** — Use ES modules; `namespace` is legacy
- [ ] **No class inheritance hierarchies** — Prefer composition; use `interface`
      for contracts
- [ ] **Branded types for domain IDs** — Nominal types (via `Brand` or `Opaque`)
      prevent accidental mixing of structurally identical primitives
- [ ] **Template literal types** — Use template literals for structured string
      patterns (e.g., `${Namespace}/${Name}`)

---

## See Also

- [Effect Guide](./effect.md) - Effect conventions and services
- [Effect Option Guide](./effect-option.md) - Option versus nullable guidance
- [Testing Guide](./testing.md) - Test quality and coverage expectations
