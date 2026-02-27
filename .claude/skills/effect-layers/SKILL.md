---
name: effect-layers
description: Effect Layer construction, composition, and provision. Use when creating layers, wiring dependencies, composing service graphs, or providing layers to programs.
user-invocable: false
---

# Effect Layers

Layers are blueprints for constructing services: `Layer<Out, Error, In>`.
`Out` = service produced, `Error` = construction failure, `In` = dependencies
needed to build it.

See /effect-service for service interface design and error types.
See /effect-testing for test layer provision patterns.

---

## Module Structure

Colocate the tag, types, and live layer within the same module directory.
Test layers live in the test tree, mirroring the source structure.

```
src/
  services/
    DocumentStore/
      index.ts              # Tag, types, and re-exports
      DocumentStoreLive.ts   # Live layer
    Notifications/
      index.ts
      NotificationsLive.ts

test/
  services/
    DocumentStore/
      DocumentStoreTest.ts   # Test layer
    Notifications/
      NotificationsTest.ts
```

---

## Naming Conventions

| Layer variant       | Suffix   | Example               |
| ------------------- | -------- | --------------------- |
| Production          | `Live`   | `DocumentStoreLive`   |
| Test / Fake         | `Test`   | `DocumentStoreTest`   |
| In-memory variant   | `Memory` | `DocumentStoreMemory` |
| Development / local | `Dev`    | `EmailDev`            |

When a service has multiple real implementations (explicit interface with
`GenericTag`), name each layer after the backing technology:

```typescript
const DocumentStoreS3 = Layer.effect(DocumentStore /* ... */);
const DocumentStorePostgres = Layer.effect(DocumentStore /* ... */);
```

Name layers by their variant, not by their role in a specific test.
`EmailTest` is reusable across test suites; `emailLayerForNotificationTest`
is not.

---

## Construction

Choose the simplest constructor that fits.

| Constructor           | When to use                                    |
| --------------------- | ---------------------------------------------- |
| `Layer.succeed`       | Static value, no setup, no dependencies        |
| `Layer.sync`          | Synchronous setup (e.g. mutable state init)    |
| `Layer.effect`        | Needs dependencies or effectful setup          |
| `Layer.scoped`        | Acquires resources requiring cleanup           |
| `Layer.effectContext` | Produces multiple service tags from one effect |

### Layer.succeed — static values

Use when the implementation is pure or only needs static config.

```typescript
export const DocumentStoreLive = Layer.succeed(DocumentStore, {
  get: (id) => /* ... */,
  put: (doc) => /* ... */,
  delete: (id) => /* ... */,
});
// Layer<DocumentStore, never, never>
```

### Layer.sync — synchronous setup with local state

```typescript
static readonly testLayer = Layer.sync(Counter, () => {
  let count = 0;
  return Counter.of({
    increment: () => Effect.sync(() => { count++ }),
    get: () => Effect.succeed(count),
  });
});
```

### Layer.effect — effectful setup with dependencies

The primary pattern. Yield dependencies, return the service.

```typescript
export const EmailLive = Layer.effect(
  Email,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const client = yield* createSmtpClient(config.smtp);
    return {
      send: (to, subject, body) =>
        Effect.tryPromise(() => client.sendMail({ to, subject, html: body })),
    };
  }),
);
// Layer<Email, never, AppConfig>
```

### Layer.scoped — resource lifecycle

For services that acquire resources needing cleanup (connections, temp dirs,
file handles). The scope manages release automatically.

```typescript
export const DatabaseLive = Layer.scoped(
  Database,
  Effect.gen(function* () {
    const config = yield* Config;
    const pool = yield* Effect.acquireRelease(createPool(config.connectionString), (pool) =>
      Effect.promise(() => pool.end()),
    );
    return {
      query: (sql, params) => Effect.tryPromise(() => pool.query(sql, params)),
    };
  }),
);
```

### Layer.effectContext — multiple tags from one effect

Use when a single setup produces multiple services.

```typescript
export const PromptServicesLive: Layer.Layer<Confirm | Select | Multiselect, never, BasePrompt> =
  Layer.effectContext(
    Effect.map(BasePrompt, (base) =>
      Context.empty().pipe(
        Context.add(Confirm, makeConfirm(base)),
        Context.add(Select, makeSelect(base)),
        Context.add(Multiselect, makeMultiselect(base)),
      ),
    ),
  );
```

---

## Composition

### Layer.merge / Layer.mergeAll — combine independent layers

Merges layers that have no dependency on each other. Runs construction
concurrently.

```typescript
// Two layers
const base = Layer.merge(NodeContext.layer, FetchHttpClient.layer);

// Many layers
const AppLayer = Layer.mergeAll(NodeContext.layer, FetchHttpClient.layer, ClackLive);
```

### Layer.provide — wire dependencies

Supplies the `In` requirements of a layer. Read as "give this layer its
dependencies."

```typescript
// LoggerLive needs Config; provide it
const LoggerWithConfig = Layer.provide(LoggerLive, ConfigLive);
// Layer<Logger, never, never>  (Config requirement satisfied)
```

For multiple dependencies:

```typescript
const DatabaseReady = Layer.provide(DatabaseLive, Layer.mergeAll(ConfigLive, LoggerLive));
```

### Layer.provideMerge — provide + keep dependencies visible

Like `Layer.provide`, but the dependency layer's output remains in the
composite output. Useful when downstream code also needs the dependency
directly.

```typescript
const appLayer = UserServiceLive.pipe(
  Layer.provideMerge(DatabaseLive),
  Layer.provideMerge(ConfigLive),
);
// Output includes UserService AND Database AND Config
```

### Compose at the edges

Individual modules export their own layers. Composition into a full
application layer happens at the entrypoint, not deep inside service modules.
Avoid deeply nested `Layer.provide` chains inside service modules.

```typescript
// src/main.ts — application entrypoint
const AppLive = Layer.mergeAll(DocumentStoreLive, NotificationsLive, EmailLive).pipe(
  Layer.provide(AppConfigLive),
  Layer.provide(DatabaseLive),
);
```

Test files compose their own layer, substituting test doubles where needed.
This makes the substitution boundary explicit — you can see at a glance
what's real and what's faked:

```typescript
// test/integration/notifications.test.ts
const TestEnv = Layer.mergeAll(
  NotificationsLive, // Real implementation under test
  EmailTest, // Fake dependency
  DocumentStoreMemory, // In-memory dependency
);
```

---

## Providing Layers to Programs

### Effect.provide — at the call site

```typescript
const program = Effect.gen(function* () {
  const db = yield* Database;
  return yield* db.query("SELECT 1");
});

const runnable = program.pipe(Effect.provide(AppLayer));
```

### ManagedRuntime — at the application edge

For CLI apps, create a `ManagedRuntime` from the top-level layer for proper
lifecycle management and resource cleanup.

```typescript
export const AppLayer = Layer.mergeAll(NodeContext.layer, FetchHttpClient.layer, ClackLive);

export const Runtime = ManagedRuntime.make(AppLayer);

// In the run() entry point:
Runtime.runPromise(program);
```

### Conditional layer composition

When some layers depend on runtime options (e.g. workspace scope), compose
them at the entry point:

```typescript
export function run(program, options?) {
  if (options?.workspace) {
    const wsLayer = workspaceLayer(options.workspace);
    const sourcesLayer = Layer.provide(SourcesLive, wsLayer);
    return program.pipe(
      Effect.provide(Layer.mergeAll(wsLayer, sourcesLayer)),
      Effect.scoped,
      Runtime.runPromise,
    );
  }
  return Runtime.runPromise(program);
}
```

---

## Memoization

Layers are memoized by reference identity. The same layer instance used in
multiple places constructs the service only once.

```typescript
// BAD: two separate pool instances (different Layer.effect calls)
const app = Layer.merge(
  Layer.provide(RepoA, Postgres.layer({ url, poolSize: 10 })),
  Layer.provide(RepoB, Postgres.layer({ url, poolSize: 10 })),
);

// GOOD: single shared pool (same reference)
const postgres = Postgres.layer({ url, poolSize: 10 });
const app = Layer.merge(Layer.provide(RepoA, postgres), Layer.provide(RepoB, postgres));
```

**Rule:** When using parameterized layer constructors, store the result in a
variable before using it in multiple places.

### Layer.fresh — opt out of memoization

Use `Layer.fresh` when each consumer needs its own instance (e.g. isolated
test state):

```typescript
const freshCounter = Layer.fresh(Counter.layer);
```

---

## Hiding Dependencies (R = never)

Service methods should not leak implementation dependencies. Dependencies
belong in the layer, not the interface.

```typescript
// BAD: dependency leaks into the interface
interface MyService {
  readonly query: (sql: string) => Effect.Effect<Row[], Error, Config | Logger>;
}

// GOOD: dependencies resolved at layer construction
interface MyService {
  readonly query: (sql: string) => Effect.Effect<Row[], Error>;
}

// Layer captures dependencies; methods close over them
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const config = yield* Config;
    const logger = yield* Logger;
    return {
      query: (sql) =>
        Effect.gen(function* () {
          yield* logger.log(`Executing: ${sql}`);
          return yield* runQuery(config.connectionString, sql);
        }),
    };
  }),
);
```

### When inner effects still need context

If service methods call functions that require services (e.g. `FileSystem`),
there are two approaches:

**Approach A: Close over the service value directly.** Preferred when methods
use the service inline.

```typescript
export const SkillManagerLive = Layer.effect(
  SkillManager,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return {
      copySkill: (src, dst) =>
        // fs and path are closed over — no R requirement
        fs.copy(src, dst).pipe(Effect.flatMap(() => fs.exists(path.join(dst, "SKILL.md")))),
    };
  }),
);
```

**Approach B: Capture a dependency layer for re-provision.** Use when methods
delegate to standalone effectful functions that declare their own `R`.

```typescript
export const SourcesLive = Layer.effect(
  Sources,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    // Capture once, re-provide to inner effects
    const deps = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Workspace, ws),
    );

    return {
      find: (source, options) => findExtensions(source, options).pipe(Effect.provide(deps)),
    };
  }),
);
```

**Tradeoffs:**

- **Approach A** is simpler and type-safe. Prefer it when practical.
- **Approach B** is necessary when delegating to functions with their own `R`
  requirements. Keep the `provide` helper typed against the actual layer to
  catch missing dependencies at compile time. Avoid `any` casts.

---

## Test Layers

### Simple test fakes

For straightforward test doubles, use `Layer.succeed` with minimal or
stubbed behavior:

```typescript
// test/services/Email/EmailTest.ts
export const EmailTest = Layer.succeed(Email, {
  send: () => Effect.void,
});
```

### Stateful test fakes

When tests need to inspect what happened (assert on sent messages, stored
records, etc.), use a `Ref` to accumulate state and expose an inspection API:

```typescript
// test/services/Email/EmailTest.ts
export interface TestEmail extends Context.Tag.Service<typeof Email> {
  readonly sentMessages: Effect.Effect<ReadonlyArray<SentMessage>>;
}

export const EmailTest = Layer.effect(
  Email,
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<SentMessage>>([]);
    return {
      send: (to, subject, body) => Ref.update(ref, (msgs) => [...msgs, { to, subject, body }]),
      sentMessages: Ref.get(ref),
    };
  }),
);
```

### In-memory test variants

For repository-style services, an in-memory implementation gives
integration-level confidence without external infrastructure:

```typescript
export const DocumentStoreMemory = Layer.succeed(DocumentStore, {
  // Backed by a Map, no I/O
});
```

### Per-test vs shared layers

**Per-test (preferred):** Fresh layers prevent state leakage.

```typescript
it.effect("works", () =>
  Effect.gen(function* () {
    const svc = yield* MyService;
    // ...
  }).pipe(Effect.provide(MyService.testLayer)),
);
```

**Suite-shared:** Only for expensive resources (DB connections). Beware state
leakage between tests.

---

## Checklist

- [ ] **Colocate tag + live layer** — same module directory; test layers in
      test tree
- [ ] **Name by variant** — `Live`, `Test`, `Memory`, `Dev`, or backing tech
- [ ] **Simplest constructor** — `succeed` > `sync` > `effect` > `scoped`
- [ ] **R = never on interfaces** — dependencies captured in layer, not leaked
- [ ] **Close over values** — prefer closing over yielded services directly
- [ ] **Typed re-provision** — if using captured dep layer, type the `provide`
      helper against the actual layer (no `any` casts)
- [ ] **Memoize by reference** — store parameterized layers in variables
- [ ] **Compose at the edges** — entrypoint and test setup, not inside modules
- [ ] **Per-test layers** — fresh state per test unless resource is expensive
