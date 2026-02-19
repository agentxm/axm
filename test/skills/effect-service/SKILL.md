---
name: effect-service
description: Effect service architecture interfaces, error types, layers, retries. Use when creating new services or defining error hierarchies.
user-invocable: false
---

# Effect Service Design Patterns

Apply these patterns when designing Effect services in this codebase.

---

## Service Interface Pattern

Use the inferred interface pattern to avoid circular references:

```typescript
// 1. Define implementation - let Effect infer method return types
const make = (config: Config) => {
  const doSomething = (input: string) =>
    Effect.tryPromise({
      try: () => externalApi.call(input),
      catch: mapToMyError,
    });

  return { doSomething };
};

// 2. Infer the service type from implementation
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

### Service Interface Checklist

- [ ] **Infer from implementation** — Use `ReturnType<typeof make>` not explicit interface
- [ ] **Let methods infer types** — Effect infers `Effect<A, E, R>` signatures
- [ ] **No return type on make** — Avoid circular references
- [ ] **Tag after type** — Service tag created after type inference
- [ ] **Single responsibility** — Service handles one domain concern

---

## Error Type Design

Use `Data.TaggedError` for pattern matching and structural equality:

```typescript
export class ApiError extends Data.TaggedError("ApiError")<{
  readonly status?: number;
  readonly message: string;
  readonly retryable: boolean;
}> {}
```

Map external errors at boundaries:

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

### Error Type Checklist

- [ ] **Use TaggedError** — All service errors extend `Data.TaggedError`
- [ ] **Map at boundaries** — External errors mapped to domain errors
- [ ] **Include retryable property** — For retry logic
- [ ] **Descriptive fields** — Include relevant context
- [ ] **Unknown handled** — Error mappers handle `unknown`

---

## Layer Construction

Environment-based layer for production:

```typescript
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return yield* Effect.fail(new ConfigError({ message: "API_KEY is required" }));
    }
    return make({ apiKey });
  }),
);
```

Test layer with explicit config:

```typescript
export const makeMyServiceLayer = (config: Partial<Config> & { apiKey: string }) =>
  Layer.succeed(
    MyService,
    make({
      apiKey: config.apiKey,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    }),
  );
```

### Layer Construction Checklist

- [ ] **Validate config in layer** — Required config validated during construction
- [ ] **Fail with ConfigError** — Missing config fails with typed error
- [ ] **Explicit config parameters** — Test layers accept explicit config
- [ ] **Sensible defaults** — Optional config has reasonable defaults
- [ ] **No side effects in make** — Side effects happen in layer, not make

---

## Retry Policies

Define retry behavior using `Schedule`:

```typescript
const retryPolicy = Schedule.exponential(Duration.seconds(1)).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.whileInput((error: ApiError) => error.retryable),
);

const doSomething = (input: string) =>
  Effect.tryPromise({
    try: () => api.call(input),
    catch: mapApiError,
  }).pipe(Effect.retry(retryPolicy));
```

### Retry Policy Checklist

- [ ] **Retryable as error property** — Eligibility from error's `retryable` field
- [ ] **Bounded retries** — Use `Schedule.recurs(n)` to limit attempts
- [ ] **Exponential backoff** — Use `Schedule.exponential` for external calls
- [ ] **Condition on error** — Use `Schedule.whileInput` for retryable only
