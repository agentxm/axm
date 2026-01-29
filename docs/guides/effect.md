---
status: active
description:
  Patterns for using Effect in this project—generator functions, error handling,
  services, layers, and retry policies. Start here when writing Effect code.
---

# Effect Guide

This project uses Effect for all business logic and I/O. Effect provides typed
errors, dependency injection, and composable async operations. This guide covers
when and how to use Effect patterns in this codebase.

**Not covered:** Effect streams, runtime configuration, resource management, or
testing strategies. For testing Effect services, see the testing guidelines.

---

## Core Principles

Effect replaces Promises and async/await with typed, composable operations:

- All async operations return `Effect<A, E, R>`, never `Promise<T>`
- Use typed errors (`E`) instead of thrown exceptions
- Use dependency injection via Effect services (`R`)

The type signature `Effect<A, E, R>` means: an operation that succeeds with `A`,
fails with `E`, and requires dependencies `R`. This makes error handling and
dependencies explicit in the type system.

For pattern mapping (async/await to Effect equivalents) and code examples, see
the `/effect-basics` skill.

### Core Principles Checklist

- [ ] **No raw Promises** — All async operations use Effect
- [ ] **No async/await** — Use `Effect.gen` with `yield*`
- [ ] **Typed errors** — Use `Effect.tryPromise` with error mapping
- [ ] **Concurrent when independent** — Use `Effect.all` with concurrency
- [ ] **Services for I/O** — Use `@effect/platform` services
- [ ] **No runPromise in logic** — Only at entry points

---

## When to Use Services vs Simple Functions

**Default to simple functions.** Use the least powerful abstraction that solves
the problem. Services add indirection and boilerplate—only use them when the
benefits outweigh the costs.

### Simple Functions (Preferred Default)

```typescript
// Just a function returning an Effect
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

**Use simple functions when:**

- Operation is stateless (most are)
- No shared configuration beyond what's in dependencies
- Function composes well with other Effects
- Testing via `Effect.provide` is sufficient

### Services (When Justified)

**Use services when:**

- Shared mutable state (caches, connection pools, rate limiters)
- Complex initialization requiring cleanup (via `Effect.acquireRelease`)
- Configuration shared across multiple methods
- Need to swap entire implementation in tests (not just dependencies)

### Function vs Service Checklist

- [ ] **Default to functions** — Start with simple functions, refactor to
      service only when needed
- [ ] **Stateless = function** — If operation has no shared state, use a
      function
- [ ] **Shared state = service** — Caches, pools, or mutable config justify a
      service
- [ ] **Cleanup required = service** — Use service with `Effect.acquireRelease`
      for resource cleanup
- [ ] **Minimal indirection** — Prefer direct function calls over service method
      access

---

## Service Interface Patterns

TypeScript cannot infer complex Effect types through function boundaries, which
is why this pattern uses explicit method signatures. The inferred interface
pattern avoids circular references while maintaining type safety through
`ReturnType<typeof make>`. See
[Effect Context](https://effect.website/docs/context-management/services-and-layers/)
for the underlying service and layer concepts.

### Interface Approach Comparison

| Approach           | Pros                             | Cons                                        |
| ------------------ | -------------------------------- | ------------------------------------------- |
| Explicit interface | Clear contract, self-documenting | Can drift from implementation, hides errors |
| Inferred from impl | Type-safe, no drift possible     | Less readable without IDE support           |

### Avoiding Circular References

The `make` function must not have an explicit return type annotation—this would
create a circular reference when using `ReturnType<typeof make>`. Instead, each
method within `make` gets explicit return types, providing type safety without
the circularity.

For the complete service interface pattern with code examples, see the
`/effect-service` skill.

### Service Interface Pattern Checklist

- [ ] **Infer from implementation** — Use `ReturnType<typeof make>` rather than
      explicit interface
- [ ] **Explicit method signatures** — Each method has explicit return type
      (e.g., `: Effect.Effect<Result, MyError>`)
- [ ] **No return type on make** — The `make` function has no return type
      annotation to avoid circular references
- [ ] **Tag after type** — Service tag created after type inference
      (`export const MyService = Context.GenericTag<MyService>(...)`)
- [ ] **Single responsibility** — Service handles one domain concern

---

## Error Type Design

Effect's
[`Data.TaggedError`](https://effect.website/docs/data-types/data#taggederror)
enables pattern matching with `Effect.catchTag`, discriminated unions for
exhaustive checking, and structural equality for testing. Mapping external
errors to domain errors at boundaries keeps error types clean and retry logic
simple. See
[Effect Error Management](https://effect.website/docs/error-management/two-error-types/)
for comprehensive error handling patterns.

For tagged error and error mapping patterns with code examples, see the
`/effect-service` skill.

### Error Type Design Checklist

- [ ] **Use TaggedError** — All service errors extend `Data.TaggedError`
- [ ] **Map at boundaries** — External errors mapped to domain errors at service
      boundaries
- [ ] **Include retryable property** — Error types include `retryable: boolean`
      for retry logic
- [ ] **Descriptive fields** — Errors include relevant context (status codes,
      messages, identifiers)
- [ ] **Exhaustive tags** — Error tags enable exhaustive `Effect.catchTag`
      handling
- [ ] **Unknown handled** — Error mappers handle `unknown` with sensible
      defaults

---

## Layer Construction

Layers inject configuration and dependencies into services. Environment-based
layers read from runtime environment; test layers accept explicit configuration
for deterministic testing. See
[`Layer.effect`](https://effect.website/docs/context-management/layers#layereffect)
and
[`Layer.succeed`](https://effect.website/docs/context-management/layers#layersucceed)
for layer construction APIs.

For environment-based and test layer patterns with code examples, see the
`/effect-service` skill.

### Layer Construction Checklist

- [ ] **Validate config in layer** — Required configuration validated during
      layer construction
- [ ] **Fail with ConfigError** — Missing or invalid config fails with typed
      error
- [ ] **Explicit config parameters** — Test layers accept explicit
      configuration, not environment
- [ ] **Sensible defaults** — Optional config has reasonable defaults
- [ ] **No side effects in make** — The `make` function is pure; side effects
      happen in layer

---

## Retry Policies

Define retry behavior alongside the service using Effect's
[`Schedule`](https://effect.website/docs/scheduling/schedule) module. The
`retryable` property on error types enables `Schedule.whileInput` to retry only
appropriate errors.

For retry policy patterns with code examples, see the `/effect-service` skill.

### Retry Policy Checklist

- [ ] **Retryable as error property** — Retry eligibility determined by error's
      `retryable` field
- [ ] **Bounded retries** — Use `Schedule.recurs(n)` to limit retry attempts
- [ ] **Exponential backoff** — Use `Schedule.exponential` for external service
      calls
- [ ] **Condition on error** — Use `Schedule.whileInput` to retry only retryable
      errors
- [ ] **Policy per operation** — Different operations may need different retry
      policies

---

## Running Effects

Effects are values that describe computations. They must be "run" at entry
points to execute.

| Context         | Method                                      |
| --------------- | ------------------------------------------- |
| CLI entry point | `Effect.runPromise` or `BunRuntime.runMain` |
| Tests           | `Effect.runPromise` within test functions   |
| Business logic  | **Never** — compose Effects, don't run them |

In business logic, compose Effects together and return them. Only at the
application boundary (CLI handler, test runner) should you call `runPromise` to
execute the composed Effect.

---

## Skills

- `/effect-basics` — Core patterns: generators, wrapping promises, concurrency,
  error handling
- `/effect-service` — Service patterns: interfaces, error types, layers, retry
  policies

## See Also

- [Effect Context](https://effect.website/docs/context-management/services-and-layers/) —
  Official service and layer documentation
- [Effect Error Management](https://effect.website/docs/error-management/two-error-types/) —
  Official error handling patterns
