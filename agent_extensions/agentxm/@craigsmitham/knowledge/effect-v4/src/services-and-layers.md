---
type: Guide
title: Services and layers
description: Designing service boundaries and Layer graphs and running the result; use when dependencies are threaded through parameters, hidden in globals, hard to replace in tests, or when a runner is handed an unexhausted error channel.
tags: [effect, effect-v4, services, layers, context, dependency-injection, composition-root, runtime, run-main, error-channel]
status: stable
sources:
  - id: docs-service
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/03_services/01_service.ts
    title: Official Effect docs — defining services (effect 4.0.0-rc.111)
  - id: docs-layer-composition
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/03_services/20_layer-composition.ts
    title: Official Effect docs — Layer.provide vs provideMerge (effect 4.0.0-rc.111)
  - id: docs-layer-unwrap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/03_services/20_layer-unwrap.ts
    title: Official Effect docs — choosing an implementation with Layer.unwrap (effect 4.0.0-rc.111)
  - id: docs-run-main
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/01_effect/06_running/10_run-main.ts
    title: Official Effect docs — running programs with runMain and Layer.launch (effect 4.0.0-rc.111)
  - id: src-layer
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Layer.ts
    title: Layer module source — memoization, fresh, provide, launch (effect 4.0.0-rc.111)
  - id: src-context
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Context.ts
    title: Context module source — Service, Reference, key identity (effect 4.0.0-rc.111)
  - id: applied-effect-http-recorder
    resource: https://github.com/anomalyco/effect-http-recorder/blob/89e1b85f7caa12ad076b8f9b65c804f89c60ecd0/src/cassette/store.ts
    title: effect-http-recorder@89e1b85 — one service key with filesystem and in-memory layers
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local/src/Replica.ts
    title: effect-local@faa52d9 — production layer graph with typed construction failure
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/effect/app-runtime.ts
    title: opencode@2cba7e2 — composition root handed to ManagedRuntime
  - id: src-internal-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/internal/effect.ts
    title: Effect runtime internals — runPromise throws causeSquash, and causeSquash's Fail/Die/Interrupt precedence (effect 4.0.0-rc.111)
  - id: src-cause
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Cause.ts
    title: Cause module source — squash as the lossy destructor the runners use (effect 4.0.0-rc.111)
  - id: src-runtime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Runtime.ts
    title: Runtime module source — makeRunMain accepts any E and is built to report it (effect 4.0.0-rc.111)
  - id: src-http-effect
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/http/HttpEffect.ts
    title: HttpEffect source — toHandled drives E to never before runForkWith (effect 4.0.0-rc.111)
  - id: src-http-server-error
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/http/HttpServerError.ts
    title: HttpServerError source — causeResponse handles Fail, Die, and Interrupt separately, 499 versus 503 (effect 4.0.0-rc.111)
  - id: applied-opencode-bridge
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/opencode/src/effect/bridge.ts
    title: opencode@65c3597 — a generic runPromise over arbitrary E beside a runPromiseExit sibling in the same object
  - id: applied-livestore-cast
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/common-cf/src/do-rpc/server.ts
    title: livestore@31e8d71 — `as Effect.Effect<void>` standing in for exhaustion before runPromise (counterexample)
  - id: applied-alchemy-test-cast
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy-test/src/cli.ts
    title: alchemy-effect@1596e50 — `as Effect.Effect<void>` before BunRuntime.runMain, where the cast was never needed (counterexample)
  - id: api-effect-v4
    resource: https://www.effect.website/docs/v4/api
    title: Effect v4 API reference — browsable Layer, Runtime, and ManagedRuntime module surfaces
    author: team:effect
    last_modified: 2026-08-17
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-services-and-layers/src/SKILL.md
    title: effect-v4-services-and-layers skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
  - by: claude/opus-5
    at: 2026-08-17T22:10:00Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Services and layers

Model capabilities as services and construction as layers.

**Applies when** dependencies are threaded through parameters, hidden in
globals, difficult to replace in tests, constructed repeatedly, or require other
dependencies or managed startup — even when Context or Layer is not yet present.

**Leave alone** pure helpers, short-lived local values, and data that is not a
capability.

Related: [Config](config.md) for settings resolved during construction,
[Resource safety](resource-safety.md) for acquisition and release guarantees,
[Testing](testing.md) for substitution through the same service key,
[Observability](observability.md) for providing exporters at the edge, [Error
modeling](error-modeling.md) for the failures a runner is handed, [Wrapping](wrapping.md)
for what crosses out to a non-Effect caller, and the [Effect v4 API
reference](https://www.effect.website/docs/v4/api) for browsing the `Layer`,
`Runtime`, and `ManagedRuntime` surfaces.

## Decide

- Make a service represent a cohesive capability, not an implementation class
  or a bag of unrelated helpers.
- Put required services in an Effect's environment instead of threading them
  through every call.
- Use `Context.Service` for capabilities supplied by callers. Use
  `Context.Reference` only for a genuinely meaningful default.[^src-context]
- Keep business operations in the service contract; keep acquisition,
  configuration, and dependency wiring in its `Layer`. Read and validate
  configuration during construction ([Config](config.md)); keep construction
  failures typed and distinct from operation failures.
- Compose the layer graph once near the application boundary. Provide
  individual services only at narrow integration or test boundaries.

Do not turn pure functions, request data, or every configurable value into a
service.

## Define a capability and implementation

```ts
import { Context, Effect, Layer } from "effect"

class Users extends Context.Service<
  Users,
  { readonly find: (id: UserId) => Effect.Effect<User, UserNotFound> }
>()("app/Users") {}

const UsersLive = Layer.effect(
  Users,
  Effect.gen(function*() {
    const repository = yield* UserRepository
    return Users.of({ find: repository.find })
  }),
)
```

- Give every service a unique stable identifier: the string key is the
  service's runtime identity, and reusing a key makes unrelated services
  occupy the same slot.[^src-context]
- Keep method environment requirements at `never`; resolve dependencies while
  constructing the layer so callers see only the declared capability.
- Default to one service class plus its inline readonly interface. Extract a
  named interface only when several implementations or public reuse make it
  clearer — as when one key is served by both a live and an in-memory
  layer.[^applied-effect-http-recorder]
- A standalone `UsersLive` const and the official convention of a static
  `layer` on the service class are equivalent; pick one per codebase and stay
  consistent.[^docs-service]
- One layer should construct one cohesive service. Merge independent layers;
  provide prerequisites into dependent layers.

## Preserve lifetimes

- Use scoped construction for clients, pools, servers, subscriptions, and
  other acquired resources: acquire with `Effect.acquireRelease` inside
  `Layer.effect`, whose scope owns the finalizer. rc.111 has no separate
  `Layer.scoped` constructor.[^src-layer]
- Rely on layer memoization for shared instances: reusing the same layer value
  shares one acquisition. Use `Layer.fresh` only when independent acquisition
  is intentional.[^src-layer]
- A fallback layer must handle a named construction failure intentionally.
- Avoid reading a service while constructing the same service through a
  circular dependency; split the capability or the graph.

What release must guarantee under failure and interruption is owned by
[Resource safety](resource-safety.md).

## Compose once

- Keep a single application composition root. Feature modules export service
  contracts and Live/Test layers, not hidden runtime execution.
- Use `Layer.merge`/`mergeAll` for independent outputs and `Layer.provide`
  when one layer consumes another. Use `provideMerge` only when the
  prerequisite must remain available to the resulting
  environment.[^docs-layer-composition]
- For optional infrastructure, choose the Live or no-op/in-memory layer inside
  a factory (`Layer.unwrap`) while preserving the same output service
  contract.[^docs-layer-unwrap]

## Run the composed graph

- For a process entrypoint, run the program with the platform `runMain`
  (`NodeRuntime.runMain`, `BunRuntime.runMain`), which installs signal
  handlers and interrupts running fibers for graceful shutdown.[^docs-run-main]
- When the application *is* the layer graph — servers, workers, daemons — use
  `Layer.launch` to build it, hold it open, and release it on
  interruption.[^docs-run-main]
- When a non-Effect host drives execution, build a `ManagedRuntime` from the
  composition root once, run effects through it, and own its disposal
  explicitly.[^applied-opencode]

## Exhaust `E` before a boundary that promises `E = never`

The runners are lossy on purpose. `runPromise` throws `causeSquash(exit.cause)`,
which returns the first `Fail`'s error, else the first `Die`'s defect, else a
synthesized `Error("All fibers interrupted without error")`. The thrown value is
`unknown` and carries no discriminator, so the catcher cannot tell a business
failure from a bug from a shutdown.[^src-internal-effect] [^src-cause]

- Reach `never` by *handling*, not by asserting. Upstream's HTTP server is the
  model: `HttpEffect.toHandled` is typed `Effect<void, never, …>`, and
  `causeResponse` walks the cause reasons and treats `Fail`, `Die`, and
  `Interrupt` separately — a client abort becomes 499, a server abort 503 —
  before `runForkWith` ever sees the effect.[^src-http-effect]
  [^src-http-server-error]
- The sanctioned exception is a process main. `Runtime.makeRunMain` accepts any
  `E` and is designed to report it, so hand `NodeRuntime.runMain` /
  `BunRuntime.runMain` the real error type. The rule applies to boundaries whose
  signature *promises* `E = never`, not to mains.[^src-runtime]
- Never reach `never` with a cast. `as Effect.Effect<void>` type-checks
  identically to a real exhaustion and guarantees nothing: the failures still
  occur and still squash. Two production runners do this — livestore casts
  immediately before `Effect.runPromise` in a Durable Object stream handler, and
  alchemy-test casts before `BunRuntime.runMain`, which would have accepted the
  error type unchanged.[^applied-livestore-cast] [^applied-alchemy-test-cast]
- A generic host bridge cannot exhaust anything, so do not pretend otherwise:
  prefer `runPromiseExit` and let the caller decide. opencode ships both in one
  object — a `promise` member that runs arbitrary `E` through `runPromise`, and
  a `run` member that takes `runPromiseExit` and resumes with
  `Effect.failCause(exit.cause)`, preserving every reason.[^applied-opencode-bridge]

What the surviving failure becomes for a non-Effect caller — a domain value or a
serialized `Exit` — is owned by [Wrapping](wrapping.md).

## Keep substitution honest

- Supply test implementations through layers rather than branching production
  code.
- Prefer small contract-compatible fakes over mocks of internal calls.
- Expose the least capability consumers need.
- Production and test implementations substitute through the same service key.

## Review checklist

- Each service owns one capability and exposes readonly operations.
- Method requirements do not leak implementation dependencies.
- Independent and dependent layers use the correct composition operator.
- Memoization, freshness, scope, configuration, and construction failure are
  explicit.
- One entrypoint owns execution: `runMain`, `Layer.launch`, or a deliberately
  disposed `ManagedRuntime`.
- Every boundary typed `E = never` got there by handling `Fail`, `Die`, and
  `Interrupt`, not by an `as Effect.Effect<…>` cast; process mains keep their
  real error type.
- Production and test implementations substitute through the same service key.

[^src-context]: `Context.Service`, `Context.Reference`, and key identity: `packages/effect/src/Context.ts` at `effect@4.0.0-rc.111`.
[^src-layer]: Scoped construction, memoization, and `Layer.fresh`: `packages/effect/src/Layer.ts` at `effect@4.0.0-rc.111`; `Layer.effect` erases `Scope` from the construction effect's requirements and runs it in the layer scope.
[^docs-service]: `ai-docs/src/01_effect/03_services/01_service.ts` at `effect@4.0.0-rc.111`.
[^docs-layer-composition]: `ai-docs/src/01_effect/03_services/20_layer-composition.ts` at `effect@4.0.0-rc.111`.
[^docs-layer-unwrap]: `ai-docs/src/01_effect/03_services/20_layer-unwrap.ts` at `effect@4.0.0-rc.111`.
[^docs-run-main]: `ai-docs/src/01_effect/06_running/10_run-main.ts` at `effect@4.0.0-rc.111`; `Layer.launch` at `packages/effect/src/Layer.ts`.
[^applied-effect-http-recorder]: Observed in effect-http-recorder@89e1b85 `src/cassette/store.ts` (effect 4.0.0-beta.83).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/opencode/src/effect/app-runtime.ts` (effect 4.0.0-beta.83).
[^src-internal-effect]: `packages/effect/src/internal/effect.ts` at `effect@4.0.0-rc.111` — `runPromiseWith` resolves the exit and, on `Failure`, `throw causeSquash(exit.cause)` (:5475-5488); `causeSquash` (:299-308) partitions the cause and returns `Fail[0].error`, else `Die[0].defect`, else `new Error("All fibers interrupted without error")`, else `new Error("Empty cause")`. Its return type is `unknown`.
[^src-cause]: `packages/effect/src/Cause.ts` at `effect@4.0.0-rc.111` — `squash` (:736) is `effect.causeSquash`; its own docstring points at `prettyErrors` as the "non-lossy conversion".
[^src-runtime]: `packages/effect/src/Runtime.ts` at `effect@4.0.0-rc.111` — `makeRunMain` (:181) is generic in `<E, A>` and returns a function accepting `Effect<A, E>`; error reporting is on by default and suppressed only with `disableErrorReporting`.
[^src-http-effect]: `packages/effect/src/unstable/http/HttpEffect.ts` at `effect@4.0.0-rc.111` — `toHandled` (:36) returns `Effect<void, never, Exclude<R | RH | HttpServerRequest, Scope>>` (:43) after `Effect.matchCauseEffect` (:68) routes every cause through `causeResponse`; the web handler forks the already-exhausted app with `Effect.runForkWith(reqContext)(httpApp)` (:261).
[^src-http-server-error]: `packages/effect/src/unstable/http/HttpServerError.ts` at `effect@4.0.0-rc.111` — `causeResponse` (:283) switches over `reason._tag` for `Fail`, `Die` (with a special case for a `HttpServerResponse` thrown as a defect), and `Interrupt`, and maps a pure interrupt to `clientAbortError` (499) or `serverAbortError` (503) depending on the `ClientAbort` annotation (:320, :359-360).
[^applied-opencode-bridge]: Observed in opencode@65c3597 `packages/opencode/src/effect/bridge.ts` (effect 4.0.0-beta.83) — `promise: <A, E, R>(effect) => … Effect.runPromise(wrap(effect))` (:65) squashes arbitrary `E` for every caller, while the sibling `run` (:68-76) uses `Effect.runPromiseExit` and resumes with `Effect.failCause(exit.cause)`.
[^applied-livestore-cast]: Observed in livestore@31e8d71 `packages/@livestore/common-cf/src/do-rpc/server.ts` (effect 4.0.0-beta.99) — the Durable Object stream pipeline ends `Effect.tapCauseLogPretty, (_) => _ as Effect.Effect<void>, Effect.runPromise` (:353-357). The cast is the only thing making the runner type-check. Cited as a counterexample.
[^applied-alchemy-test-cast]: Observed in alchemy-effect@1596e50 `packages/alchemy-test/src/cli.ts` (effect 4.0.0-rc.110) — `BunRuntime.runMain(effect as Effect.Effect<void>, { … })` (:255). `runMain` accepts any `E`, so the cast buys nothing and erases the failure type the teardown would otherwise see. Cited as a counterexample.
