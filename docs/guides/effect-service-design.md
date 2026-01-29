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

## See Also

- `/effect-service` skill — Ready-to-use code patterns for all sections above
- `/effect-basics` skill — Foundational Effect patterns (generators, error
  handling)
- [Effect Context](https://effect.website/docs/context-management/services-and-layers/) —
  Official service and layer documentation
- [Effect Error Management](https://effect.website/docs/error-management/two-error-types/) —
  Official error handling patterns
