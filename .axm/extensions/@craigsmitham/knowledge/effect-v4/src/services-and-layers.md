---
type: Guide
title: Services and layers
description: Designing service boundaries and Layer graphs; use when dependencies are threaded through parameters, hidden in globals, or hard to replace in tests.
tags: [effect, effect-v4, services, layers, context, dependency-injection, composition-root, runtime]
status: stable
sources:
  - id: docs-service
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/03_services/01_service.ts
    title: Official Effect docs — defining services (effect 4.0.0-rc.110)
  - id: docs-layer-composition
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/03_services/20_layer-composition.ts
    title: Official Effect docs — Layer.provide vs provideMerge (effect 4.0.0-rc.110)
  - id: docs-layer-unwrap
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/03_services/20_layer-unwrap.ts
    title: Official Effect docs — choosing an implementation with Layer.unwrap (effect 4.0.0-rc.110)
  - id: docs-run-main
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/06_running/10_run-main.ts
    title: Official Effect docs — running programs with runMain and Layer.launch (effect 4.0.0-rc.110)
  - id: src-layer
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Layer.ts
    title: Layer module source — memoization, fresh, provide, launch (effect 4.0.0-rc.110)
  - id: src-context
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Context.ts
    title: Context module source — Service, Reference, key identity (effect 4.0.0-rc.110)
  - id: applied-effect-http-recorder
    resource: https://github.com/anomalyco/effect-http-recorder/blob/89e1b85f7caa12ad076b8f9b65c804f89c60ecd0/src/cassette/store.ts
    title: effect-http-recorder@89e1b85 — one service key with filesystem and in-memory layers
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local/src/Replica.ts
    title: effect-local@faa52d9 — production layer graph with typed construction failure
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/opencode/src/effect/app-runtime.ts
    title: opencode@2cba7e2 — composition root handed to ManagedRuntime
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-services-and-layers/src/SKILL.md
    title: effect-v4-services-and-layers skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:10:36Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:10:36Z
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
[Observability](observability.md) for providing exporters at the edge.

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
  `Layer.effect`, whose scope owns the finalizer. rc.110 has no separate
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
- Production and test implementations substitute through the same service key.

[^src-context]: `Context.Service`, `Context.Reference`, and key identity: `packages/effect/src/Context.ts` at `effect@4.0.0-rc.110`.
[^src-layer]: Scoped construction, memoization, and `Layer.fresh`: `packages/effect/src/Layer.ts` at `effect@4.0.0-rc.110`; `Layer.effect` erases `Scope` from the construction effect's requirements and runs it in the layer scope.
[^docs-service]: `ai-docs/src/01_effect/03_services/01_service.ts` at `effect@4.0.0-rc.110`.
[^docs-layer-composition]: `ai-docs/src/01_effect/03_services/20_layer-composition.ts` at `effect@4.0.0-rc.110`.
[^docs-layer-unwrap]: `ai-docs/src/01_effect/03_services/20_layer-unwrap.ts` at `effect@4.0.0-rc.110`.
[^docs-run-main]: `ai-docs/src/01_effect/06_running/10_run-main.ts` at `effect@4.0.0-rc.110`; `Layer.launch` at `packages/effect/src/Layer.ts`.
[^applied-effect-http-recorder]: Observed in effect-http-recorder@89e1b85 `src/cassette/store.ts` (effect 4.0.0-beta.83).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/opencode/src/effect/app-runtime.ts` (effect 4.0.0-beta.83).
