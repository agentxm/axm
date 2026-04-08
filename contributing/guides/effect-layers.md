---
status: active
last-reviewed: 2026-04-03
version: 0.1.0
description: "When creating layers, wiring dependencies, or composing service graphs. Covers construction, composition, and provision patterns."
depends-on: [./effect.md]
---

# Effect Layers Guide

Patterns for constructing, composing, and providing Effect Layers in a CLI
application. Covers layer composition, service granularity, memoization,
resource lifecycle, testing, configuration, error handling, and observability --
then applies those patterns to CLI apps built with `effect/unstable/cli` and
`BunRuntime.runMain`.

Does not cover Effect fundamentals (see [Effect Guide](./effect.md)) or
Option/nullable conventions (see [Effect Option Guide](./effect-option.md)).

Synthesizes the
[official Effect documentation](https://effect.website/docs/requirements-management/layers/),
[Effect Solutions](https://www.effect.solutions/) by Kit Langton,
[EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns), practitioner
blog posts, and [Effect Days 2025](https://effect.website/events/effect-days)
conference talks.

---

## 1. General Guidance

### Layer Composition

The
[official Layer documentation](https://effect.website/docs/requirements-management/layers/)
defines four composition primitives that combine layers horizontally
(independent services) and vertically (dependent services). Choosing the wrong
combinator can duplicate resources or hide services needed for testing.
`Layer.provideMerge` deserves special attention -- it keeps intermediate services
visible in the output, which is essential for test setup and assertions
([Effect Solutions](https://www.effect.solutions/testing)).

```ts
// Horizontal: independent services
const InfraLayer = Layer.merge(ConfigLive, LoggerLive);

// Vertical: LoggerLive requires Config; ConfigLive satisfies it
const LoggerResolved = Layer.provide(LoggerLive, ConfigLive);

// Convenience: many independent layers
const AppLayer = Layer.mergeAll(ConfigLive, LoggerLive, DatabaseLive);

// Testing: keep intermediate services visible
const testLayer = Events.layer.pipe(
  Layer.provideMerge(Users.testLayer),
  Layer.provideMerge(Tickets.testLayer),
);

// Combined: real dependency graph at the composition root
const MainLive = Layer.merge(
  Layer.provide(BLive, ALive), // B depends on A
  Layer.provide(CLive, ALive), // C depends on A -- ALive is shared (memoized)
);
```

#### Layer Composition Checklist

- [ ] **Merge for independent** -- `Layer.merge` or `Layer.mergeAll` used only
      for layers with no dependency between them
- [ ] **Provide for dependent** -- `Layer.provide` used when a downstream layer
      depends on an upstream layer's output
- [ ] **ProvideMerge for tests** -- `Layer.provideMerge` used when test code
      needs access to intermediate services
- [ ] **Single composition root** -- All layer wiring happens in one place at the
      application edge

### Layer Enable/Disable

Layers that can be conditionally enabled or disabled based on configuration
handle the decision inside their own factory function -- not at the composition
root. The factory accepts a config object, checks its flags, and returns
`Layer.empty` (or a noop service implementation) when disabled.

```ts
// Self-contained layer with no service output -> Layer.empty
export const makeSentryTracerLayer = (config: { readonly enabled: boolean }): Layer.Layer<never> =>
  config.enabled ? Layer.setTracer(SentryEffectTracer) : Layer.empty;

// Layer that provides a service -> noop implementation
export const makeFooLayer = (config: FooConfig): Layer.Layer<FooService> => {
  if (!config.enabled) return Layer.succeed(FooService, FooService.noop);
  return FooServiceLive;
};
```

The composition root stays flat -- it calls factories and merges, but does not
branch:

```ts
// Good: composition root passes config; factory decides
return Layer.mergeAll(
  Layer.succeed(AppConfig, config),
  makeLoggingLayer({ ... }),
  makeTracingLayer({ ... }),
  AuthLayer,
);

// Bad: composition root branches on config
const tracerLayer = tracingEnabled
  ? Layer.setTracer(SentryEffectTracer)
  : Layer.empty;
```

Static layers that have no enable/disable dimension (e.g., `AuthLayer`) remain
as module-level constants -- there is no need to wrap them in a factory just for
consistency.

For guidance on typing layer factory parameters -- when to use `Option<T>` vs
`boolean` vs optional properties -- see the
[Effect Option Guide](./effect-option.md).

#### Layer Enable/Disable Checklist

- [ ] **Factory owns the decision** -- Enable/disable checks live in the layer
      factory, not in the composition root
- [ ] **`Layer.empty` for no-service layers** -- Disabled layers that provide no
      services return `Layer.empty`
- [ ] **Noop implementation for service layers** -- Disabled layers that provide
      services return a noop implementation satisfying the service contract
- [ ] **Composition root stays flat** -- The composition root calls factories and
      merges without conditional branches
- [ ] **Static layers stay static** -- Layers with no enable/disable dimension
      remain as module-level constants

### Service Granularity

The [official docs](https://effect.website/docs/requirements-management/layers/)
and [Effect Solutions](https://www.effect.solutions/services-and-layers)
converge on a clear principle: dependency leakage through service interfaces
couples callers to implementation details and makes testing harder. When
dependencies are resolved at layer construction time, service methods become
pure contracts that can be swapped freely.

Kit Langton's
[Service-Driven Development](https://www.effect.solutions/services-and-layers)
takes this further: sketch leaf service Tags first as pure contracts (no
implementation), write orchestration services that type-check immediately, then
add production Layer implementations later without changing business logic.

```ts
// Clean interface -- no dependency leakage
class Database extends ServiceMap.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>;
  }
>()("@app/Database") {}

// Dependencies resolved at construction time, not in the interface
const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const pool = yield* ConnectionPool;
    return { query: (sql) => pool.execute(sql) };
  }),
);
```

Naming conventions vary: official docs use `DatabaseLive` / `DatabaseTest`
(PascalCase with suffix); Effect Solutions uses `layer` / `testLayer` as static
properties (camelCase). Consistency within a codebase matters more than which
convention.

#### Service Granularity Checklist

- [ ] **One service per layer** -- Each layer constructs exactly one service
- [ ] **Dependency-free interface** -- Service method `Requirements` type
      parameter is `never`
- [ ] **Construction-time resolution** -- Dependencies `yield*`-ed in the layer
      constructor, not in service methods
- [ ] **Error channel as contract** -- Service methods declare domain errors in
      `E` and translate dependency errors
- [ ] **Consistent naming** -- Layer names follow one convention throughout the
      codebase (`XxxLive`/`XxxTest` or `.layer`/`.testLayer`)

### Layer Memoization

Layers are memoized by default when provided, as documented in the
[Layer Memoization guide](https://effect.website/docs/requirements-management/layer-memoization/).
In v4, the underlying `MemoMap` is shared across `Effect.provide` calls, so the
same layer instance is allocated only once even when provided in separate calls.
This is critical for resources like database connection pools -- accidentally
creating two references means two pools.

Composing layers before providing is still the recommended pattern even though
v4 memoizes across `provide` calls. Layer composition makes the dependency graph
explicit and keeps the full structure visible in one place.

```ts
// Bad: creates two connection pools -- different references
Layer.merge(
  UserRepo.layer.pipe(Layer.provide(Postgres.layer({ url, poolSize: 10 }))),
  OrderRepo.layer.pipe(Layer.provide(Postgres.layer({ url, poolSize: 10 }))),
);

// Good: single shared pool -- same reference
const postgresLayer = Postgres.layer({ url, poolSize: 10 });
Layer.merge(
  UserRepo.layer.pipe(Layer.provide(postgresLayer)),
  OrderRepo.layer.pipe(Layer.provide(postgresLayer)),
);
```

Circular dependencies are prevented at the type level -- `Layer.provide` cannot
form a cycle because the output type would recurse infinitely, causing a
TypeScript compiler error.

To opt out of shared memoization -- for example, when each test needs an
independent resource pool -- use `Layer.fresh(layer)` to force a fresh build, or
pass `{ local: true }` to `Effect.provide` to build the entire layer subtree
with a local memo map.

#### Layer Memoization Checklist

- [ ] **Module-level constants** -- Parameterized layer constructors stored as
      module-level constants before reuse
- [ ] **Shared references** -- The same layer instance referenced everywhere it
      appears in the dependency graph
- [ ] **Explicit fresh** -- `Layer.fresh()` or
      `Effect.provide(layer, { local: true })` used only when separate instances
      are intentionally needed
- [ ] **No duplicate construction** -- Resource-heavy layers (pools, connections)
      appear once in the graph

### Runtime Selection

The [Runtime documentation](https://effect.website/docs/runtime/) distinguishes
two execution models. `Effect.runPromise` and `Effect.runFork` use the default
runtime with an empty service map -- suitable for simple scripts.
`ManagedRuntime` creates a persistent runtime from a Layer, pre-building all
services and holding them alive until disposed.

The [`runMain` function](https://effect.website/docs/platform/runtime/) from
`@effect/platform-node` (or `-bun`) provides automatic SIGINT/SIGTERM handling,
exit code management, error logging, and customizable teardown. `Layer.launch`
builds a layer and keeps it alive until interrupted -- designed for when the
entire application _is_ a layer (e.g., an HTTP server).

```ts
// runMain: production entry point with signal handling
BunRuntime.runMain(program.pipe(Effect.provide(AppLayer)));

// ManagedRuntime: persistent runtime for long-lived processes
const runtime = ManagedRuntime.make(AppLayer);
await runtime.runPromise(myEffect);
await runtime.dispose();

// Layer.launch: application-as-a-layer
Layer.launch(ServerLive).pipe(BunRuntime.runMain);
```

#### Runtime Selection Checklist

- [ ] **runMain for production** -- `BunRuntime.runMain` used as the entry point
      for the CLI
- [ ] **No bare runPromise in production** -- `Effect.runPromise` reserved for
      simple scripts or one-off executions without custom services

### Resource Lifecycle

The [`Scope` system](https://effect.website/docs/resource-management/scope/)
manages resource lifetimes. `acquireRelease` pairs acquisition with cleanup, and
finalizers execute in reverse order (LIFO) when the scope closes. They receive
the `Exit` value so they can react to success, failure, or interruption. All
resources acquired in layers are properly released on interrupt, as noted in the
[official guidelines](https://effect.website/docs/code-style/guidelines/).

```ts
class Database extends ServiceMap.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>;
  }
>()("Database") {
  static readonly layer = Layer.scoped(
    Database,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const connection = yield* Effect.acquireRelease(
        Effect.sync(() => createConnection(config)),
        (conn) => Effect.sync(() => conn.close()),
      );
      return { query: (sql: string) => connection.execute(sql) };
    }),
  ).pipe(Layer.provide(ConfigLive));
}
```

#### Resource Lifecycle Checklist

- [ ] **Scoped layers** -- `Layer.scoped` used for services that acquire
      resources needing cleanup
- [ ] **acquireRelease pairing** -- Every resource acquisition has a matching
      release finalizer
- [ ] **Finalizer idempotence** -- Finalizers are safe to call on success,
      failure, or interruption
- [ ] **No manual cleanup** -- Resource cleanup handled by the Scope system, not
      by callers

### Testing with Layers

The [`@effect/vitest`](https://www.npmjs.com/package/@effect/vitest) package
provides `it.effect`, `it.scoped`, and `it.live` test runners. Per-test layer
provision prevents state leakage between tests.
[Effect Solutions](https://www.effect.solutions/testing) recommends mutable
`Map`-based stores for test doubles, noting that JavaScript's single-threaded
execution makes this safe.

```ts
import { it, expect } from "@effect/vitest";

it.effect("creates a user", () =>
  Effect.gen(function* () {
    const users = yield* Users;
    yield* users.create(User.make({ id: "1", name: "Alice" }));
    const found = yield* users.findById("1");
    expect(found.name).toBe("Alice");
  }).pipe(Effect.provide(testLayer)),
);
```

Shared expensive layers can use `layer()` to avoid rebuilding per test:

```ts
import { layer } from "@effect/vitest";

layer(DatabaseTest)("database tests", (it) => {
  it.effect("queries work", () => /* ... */);
});
```

#### Testing Checklist

- [ ] **Per-test provision** -- Each test provides its own layer via
      `Effect.provide` to prevent state leakage
- [ ] **Shared expensive layers** -- `it.layer` or `layer()` used for
      resource-heavy services shared across a describe block
- [ ] **In-memory test doubles** -- Test layers use `Layer.sync` or
      `Layer.succeed` with in-memory state
- [ ] **No ConfigProvider in tests** -- Test config provided directly via
      `Layer.succeed`, not `ConfigProvider.fromMap`

### Configuration

The [Configuration guide](https://effect.website/docs/configuration/) describes
`Config` as an effect yielded during layer construction. The default
`ConfigProvider` reads from environment variables.
[Effect Solutions](https://www.effect.solutions/config) prescribes wrapping
config in a service with both production and test layers so that configuration
is testable and swappable without changing the config provider.

```ts
class ApiConfig extends ServiceMap.Service<
  ApiConfig,
  {
    readonly apiKey: Redacted.Redacted;
    readonly baseUrl: string;
  }
>()("@app/ApiConfig") {
  static readonly layer = Layer.effect(
    ApiConfig,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted("API_KEY");
      const baseUrl = yield* Config.string("BASE_URL");
      return { apiKey, baseUrl };
    }),
  );

  static readonly testLayer = Layer.succeed(ApiConfig, {
    apiKey: Redacted.make("test-key"),
    baseUrl: "https://test.example.com",
  });
}
```

#### Configuration Checklist

- [ ] **Config as service** -- Configuration wrapped in a tagged service with
      production and test layers
- [ ] **Schema validation** — Config validated with `Schema.decode` at layer
      construction (not raw `Config.mapOrFail`)
- [ ] **Namespaced keys** -- `Config.nested("PREFIX")` used for multi-component
      configuration
- [ ] **Secrets redacted** -- `Config.redacted` used for sensitive values

### Error Handling at the Layer Level

Layer construction failures are distinct from effect-level runtime failures. The
[Layers documentation](https://effect.website/docs/requirements-management/layers/)
provides `Layer.catchTag` and `Layer.catchCause` for resilient layer
construction. Layer construction errors appear in the Layer's `Error` type
parameter (`Layer<Out, Error, In>`) and propagate when `Effect.provide` is
called. Effect-level errors are tracked in the Effect's `E` parameter and
handled with `Effect.catchTag`, `Effect.catch`, and similar combinators.

```ts
// Fall back to an in-memory cache if Redis connection fails
const CacheLive = RedisCacheLive.pipe(
  Layer.catchTag("RedisConnectionError", () => InMemoryCacheLive),
);
```

#### Error Handling Checklist

- [ ] **Layer vs effect errors** -- Construction failures handled with
      `Layer.catchTag`/`Layer.catchCause`, not effect-level combinators
- [ ] **Fallback layers** -- `Layer.catchTag` used when a degraded alternative
      exists for a failing layer with a tagged construction error
- [ ] **Typed layer errors** -- Layer `Error` type parameter reflects possible
      construction failures

### Observability

Tracing integrates via
[`@effect/opentelemetry`](https://effect.website/docs/observability/tracing/),
provided as a layer. Logging is configured by replacing the
[default logger](https://effect.website/docs/observability/logging/). Metrics
use the five metric types from the
[Metrics API](https://effect.website/docs/observability/metrics/).

```ts
import { NodeSdk } from "@effect/opentelemetry";
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";

const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: "my-app" },
  spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
}));
```

#### Observability Checklist

- [ ] **Tracing as layer** -- `NodeSdk.layer` provided at the application edge
      for OpenTelemetry integration
- [ ] **Per-method spans** -- `Effect.withSpan` or `Effect.fn` used to instrument
      individual service methods
- [ ] **Logger replacement** -- Logger layer (`Logger.prettyLogger`,
      `Logger.jsonLogger`, etc.) provided explicitly rather than relying on
      defaults

---

## 2. CLI Application Patterns

The CLI modules (`effect/unstable/cli`) use a declarative command model.
`Command.run` returns an `Effect` that requires the union of all subcommand
dependencies, so layers are provided once at the top. `BunRuntime.runMain`
automatically maps failures to exit code 1, handles SIGINT/SIGTERM, and provides
built-in `--help`, `--version`, `--completions`, and `--log-level` flags. See
the [Effect Solutions CLI guide](https://www.effect.solutions/cli) for the
canonical patterns.

```ts
import { Argument, Command, Flag } from "effect/unstable/cli";
import { BunRuntime, BunServices } from "@effect/platform-bun";

const addCommand = Command.make("add", { text: Argument.string("text") }, ({ text }) =>
  Effect.gen(function* () {
    const repo = yield* TaskRepo;
    const task = yield* repo.add(text);
    yield* Console.log(`Added task #${task.id}`);
  }),
);

Command.make("tasks").pipe(
  Command.withSubcommands([addCommand, listCommand, toggleCommand]),
  Command.run({ version: "1.0.0" }),
  Effect.provide(Layer.provideMerge(TaskRepo.layer, BunServices.layer)),
  BunRuntime.runMain,
);
```

Per-subcommand layers use `Command.provide` when subcommands need different
services or flag-dependent layers. `Command.provide` accepts a static layer or
a function from parsed config to a layer:

```ts
const deployCommand = Command.make(
  "deploy",
  { env: Flag.choice("env", ["staging", "prod"]) },
  ({ env }) =>
    Effect.gen(function* () {
      const infra = yield* InfraService;
      yield* infra.deploy();
    }),
).pipe(Command.provide(({ env }) => (env === "prod" ? ProdInfraLayer : StagingInfraLayer)));
```

For providing a single service implementation (not a full layer), use
`Command.provideSync` or `Command.provideEffect` — these take a service tag as
the first argument:

```ts
// Static implementation
Command.provideSync(Logger, createLogger());

// Config-dependent implementation
Command.provideSync(Logger, (config) => createLogger(config.verbose));

// Effect-based (async/fallible construction)
Command.provideEffect(
  DbClient,
  Effect.gen(function* () {
    const url = yield* Config.string("DATABASE_URL");
    return yield* makeDbClient(url);
  }),
);
```

The production axm CLI uses `Command.provideSync` for wiring command-argv
tracking into commands.

### CLI Application Checklist

- [ ] **Edge provision** -- All layers provided once via `Effect.provide` at the
      `Command.run` / `Command.runWith` call site
- [ ] **runCliMain entry point** -- `runCliMain` from `@axm.sh/core` used as the
      CLI entry point (handles signal handling, error routing, graceful shutdown)
- [ ] **Per-subcommand layers** -- `Command.provide` used when subcommands need
      different services or flag-dependent layers
- [ ] **Single-service provision** -- `Command.provideSync` / `Command.provideEffect`
      used for injecting individual services from parsed config
- [ ] **Schema-validated config** — Config validated with `Schema.decode` at
      layer construction (not raw `Config.mapOrFail`)

---

## Open Questions

Several areas lack settled consensus. This list helps make informed choices
rather than assuming a "right" answer exists.

- **Layer naming** -- PascalCase suffixes (`DatabaseLive`) in official docs vs
  camelCase static properties (`Database.layer`) in Effect Solutions
- **`ServiceMap.Service` with `make` vs without** -- using the `make` option
  stores a constructor effect on the class but does not auto-generate a layer;
  define layers explicitly with `Layer.effect` and wire dependencies via
  `Layer.provide`
- **Per-test layer freshness** -- debated in
  [GitHub issue #4616](https://github.com/Effect-TS/effect/issues/4616), with no
  `layerFresh` API yet

---

## See Also

- [Effect Guide](./effect.md) -- Core Effect patterns, service definitions,
  and type inference
- [Effect Option Guide](./effect-option.md) -- Option versus nullable guidance,
  including layer and service parameter conventions
- [Effect v4 Quick Reference](./effect-v4-quick-ref.md) -- Common v3-to-v4
  renames and migration patterns
- [Testing Guide](./testing.md) -- Test levels, E2E scope, and Effect testing
  references
- [CLI Design Guide](./cli-design.md) -- Command structure, flags, prompts,
  and handler conventions
- [Effect Context](https://effect.website/docs/context-management/services-and-layers/) --
  Official service and layer documentation
- [Effect Solutions](https://www.effect.solutions/) -- Kit Langton's tutorials
  on services, layers, testing, and CLI
