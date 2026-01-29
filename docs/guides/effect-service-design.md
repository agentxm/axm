---
status: active
description:
  Patterns for designing Effect services—inferred interfaces, tagged errors,
  layer construction, and retry policies. Does not cover Effect streams, runtime
  configuration, or testing strategies.
---

# Effect Service Design

Patterns for designing Effect services with type-safe interfaces. Covers service
interface patterns, error type design, layer construction, and retry policies.

**Not covered:** Effect streams, runtime configuration, concurrent patterns,
resource management, or testing strategies. For testing Effect services, see
project test examples.

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

### Inferred Interface Pattern

_Illustrates: "Infer from implementation," "Explicit method signatures," "Tag
after type"_

```typescript
import { Context, Effect } from "effect";

// 1. Define the implementation with explicit method signatures
const make = (config: Config) => {
  const doSomething = (input: string): Effect.Effect<Result, MyError> =>
    Effect.tryPromise({
      try: () => externalApi.call(input),
      catch: mapToMyError,
    });

  const getConfig = (): string => config.value;

  return { doSomething, getConfig };
};

// 2. Infer the service type from the implementation
export type MyService = ReturnType<typeof make>;

// 3. Create the service tag
export const MyService = Context.GenericTag<MyService>("MyService");

// 4. Create the layer
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    // ... setup logic
    return make(config);
  }),
);
```

### Avoiding Circular References

_Illustrates: "No return type on make," "Methods typed explicitly"_

```typescript
// BAD: Circular reference
const make = (config: Config): MyService => {
  // ...
};
export type MyService = ReturnType<typeof make>; // Error: circular reference

// GOOD: No circular reference
const make = (config: Config) => {
  const doSomething = (input: string): Effect.Effect<Result, MyError> =>
    // ...

  return { doSomething };
};
export type MyService = ReturnType<typeof make>; // Works!
```

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

### Tagged Error Pattern

_Illustrates: "Use TaggedError," "Include retryable property," "Descriptive
fields"_

```typescript
import { Data } from "effect";

export class ApiError extends Data.TaggedError("ApiError")<{
  readonly status?: number;
  readonly message: string;
  readonly retryable: boolean;
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
}> {}
```

### Error Mapping Pattern

_Illustrates: "Map at boundaries," "Determine retryability at mapping time"_

```typescript
const mapApiError = (error: unknown): ApiError => {
  if (error instanceof ExternalApiError) {
    return new ApiError({
      status: error.status,
      message: error.message,
      retryable: error.status === 429 || error.status >= 500,
    });
  }
  return new ApiError({
    message: `Unexpected error: ${String(error)}`,
    retryable: false,
  });
};
```

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

### Environment-Based Layer

_Illustrates: "Validate config in layer," "Fail with ConfigError"_

```typescript
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return yield* Effect.fail(
        new ConfigError({ message: "API_KEY is required" }),
      );
    }

    return make({ apiKey });
  }),
);
```

### Test Layer Pattern

_Illustrates: "Explicit config parameters," "Sensible defaults"_

```typescript
export const makeMyServiceLayer = (
  config: Partial<Config> & { apiKey: string },
) =>
  Layer.succeed(
    MyService,
    make({
      apiKey: config.apiKey,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    }),
  );
```

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

### Retry Policy Pattern

_Illustrates: "Exponential backoff," "Bounded retries," "Retry on retryable
only"_

```typescript
import { Duration, Schedule } from "effect";

const retryPolicy = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.whileInput((error: ApiError) => error.retryable),
);

// Apply in service methods
const doSomething = (input: string): Effect.Effect<Result, ApiError> =>
  Effect.tryPromise({
    try: () => api.call(input),
    catch: mapApiError,
  }).pipe(Effect.retry(retryPolicy));
```

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
