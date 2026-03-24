---
name: effect-service
description: Effect service definition, interface design, error types, retries. Use when creating new services or defining error hierarchies.
user-invocable: false
---

# Effect Service Design Patterns

Apply these patterns when designing Effect services in this codebase.

See /effect-layers for layer construction, composition, and provision.

---

## Service Definition

### Default: combined service class + inline interface

For services with a single implementation, define the interface inline on
the `ServiceMap.Service` class. This is concise and gives you full Layer-based
dependency injection and testability.

```typescript
class NotificationService extends ServiceMap.Service<
  NotificationService,
  {
    readonly send: (to: string, message: string) => Effect.Effect<void, AppError>;
    readonly sendBatch: (
      notifications: ReadonlyArray<Notification>,
    ) => Effect.Effect<void, AppError>;
  }
>()("@axm.sh/cli/NotificationService") {}
```

The service class decouples consumers from implementations — you get testability
and composability without additional abstraction.

Appropriate for:

- Application-specific coordination or orchestration services
- Domain services with a single production implementation
- Config or environment wrappers
- Any service where you don't anticipate swapping implementations

### When to extract an explicit interface

Use a separate interface when a service **genuinely has multiple
implementations** that must conform to a shared contract.

```typescript
// The contract
interface DocumentStore {
  readonly get: (id: DocumentId) => Effect.Effect<Document, DocumentNotFound>;
  readonly put: (doc: Document) => Effect.Effect<void, StoreError>;
  readonly delete: (id: DocumentId) => Effect.Effect<void, StoreError>;
}

// The service, typed to the interface
const DocumentStore = ServiceMap.Service<DocumentStore>("@axm.sh/cli/DocumentStore");

// Implementation A
const S3DocumentStoreLayer = Layer.succeed(DocumentStore, {
  /* ... */
});

// Implementation B
const PostgresDocumentStoreLayer = Layer.succeed(DocumentStore, {
  /* ... */
});
```

This pattern is warranted when:

- **Multiple implementations exist today** — different backends, provider
  clients, or strategy-pattern services selected at runtime
- **Test doubles need a formal contract** — complex test fakes validated
  against the same shape to prevent drift
- **The interface is a domain port** — adapter boundary where the domain
  defines what it needs and infrastructure satisfies it

### Decision rule

Ask: _does this service have, or will it concretely have, more than one
implementation?_

- **No** → Combined service class pattern. Extracting an interface later is a
  straightforward, non-breaking refactor.
- **Yes** → Explicit interface with `ServiceMap.Service<Shape>(id)`.

Avoid speculative interfaces. The Layer system makes it cheap to introduce
one later, so let actual requirements drive the decision.

---

## Service Interface Design

### R = never on methods

Service methods must not leak implementation dependencies. Dependencies
belong in the layer, not the service interface.

```typescript
// BAD: dependency leaks into the interface
interface MyService {
  readonly query: (sql: string) => Effect.Effect<Row[], Error, Config | Logger>;
}

// GOOD: dependencies resolved at layer construction
interface MyService {
  readonly query: (sql: string) => Effect.Effect<Row[], Error>;
}
```

See /effect-layers for how to capture dependencies in layers while keeping
`R = never`.

### Readonly properties

Services should not expose mutable state. Use `readonly` on all properties.

```typescript
interface CounterService {
  readonly increment: () => Effect.Effect<void>;
  readonly get: () => Effect.Effect<number>;
}
```

### Single responsibility

Each service handles one domain concern. If a service has methods spanning
multiple concerns, split it.

---

## Service-Driven Development

Design leaf service interfaces before implementations. This lets you model
higher-level orchestration that type-checks immediately.

```typescript
// 1. Leaf services: contracts only (no implementation yet)
class Users extends ServiceMap.Service<
  Users,
  { readonly findById: (id: UserId) => Effect.Effect<User, UserNotFound> }
>()("@app/Users") {}

class Tickets extends ServiceMap.Service<
  Tickets,
  { readonly issue: (eventId: EventId, userId: UserId) => Effect.Effect<Ticket> }
>()("@app/Tickets") {}

// 2. Orchestration service: uses leaf contracts
class Events extends ServiceMap.Service<
  Events,
  { readonly register: (eventId: EventId, userId: UserId) => Effect.Effect<Registration> }
>()("@app/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const users = yield* Users;
      const tickets = yield* Tickets;
      return Events.of({
        register: (eventId, userId) =>
          Effect.gen(function* () {
            const user = yield* users.findById(userId);
            const ticket = yield* tickets.issue(eventId, userId);
            return { user, ticket };
          }),
      });
    }),
  );
}
```

Benefits:

- Type-checks immediately even without leaf implementations
- Adding production layers doesn't change orchestration code
- Test layers slot in without modification

---

## Naming Conventions

### Service identifiers

Use `@axm.sh/cli/<ServiceName>` as the identifier string:

```typescript
ServiceMap.Service<
  Workspace,
  {
    /* ... */
  }
>()("@axm.sh/cli/Workspace");
ServiceMap.Service<
  SourceHostProviders,
  {
    /* ... */
  }
>()("@axm.sh/cli/SourceHostProviders");
```

### Layer names

See /effect-layers for full naming conventions and module structure.

| Suffix        | Usage                       |
| ------------- | --------------------------- |
| `layer`       | Production layer            |
| `layerTest`   | Test / fake layer           |
| `layerMemory` | In-memory variant           |
| `layerDev`    | Development / local variant |

---

## Using Services

Yield the service to access it in an effect:

```typescript
const program = Effect.gen(function* () {
  const ws = yield* Workspace;
  const sources = yield* SourceHostProviders;
  const refs = yield* sources.find(source);
});
// Effect<..., ..., Workspace | SourceHostProviders>
```

The `R` parameter automatically tracks required services as a union type.

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

---

## Service Design Checklist

- [ ] **Unique namespaced tag** — `@axm.sh/cli/<ServiceName>`
- [ ] **R = never on methods** — no dependency leakage in interface
- [ ] **Readonly properties** — no mutable state exposed
- [ ] **Single responsibility** — one domain concern per service
- [ ] **Combined service class by default** — extract interface only for multiple implementations
- [ ] **Layer in effect-layers** — see /effect-layers for construction patterns
