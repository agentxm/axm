---
type: Guide
title: Services and layers
description: Designing service boundaries and Layer graphs; use when dependencies are threaded through parameters, hidden in globals, or hard to replace in tests.
tags: [effect, effect-v4, services, layers, context, dependency-injection, composition-root]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-services-and-layers/src/SKILL.md
    title: effect-v4-services-and-layers skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Services and layers

Model capabilities as services and construction as layers.

**Applies when** dependencies are threaded through parameters, hidden in
globals, difficult to replace in tests, constructed repeatedly, or require other
dependencies or managed startup — even when Context or Layer is not yet present.

**Leave alone** pure helpers, short-lived local values, and data that is not a
capability.

Related: [Config](config.md) for settings resolved during construction,
[Resource safety](resource-safety.md) for scoped layers,
[Testing](testing.md) for substitution through the same service key.

## Decide

- Make a service represent a cohesive capability, not an implementation class or a bag of unrelated helpers.
- Put required services in an Effect's environment instead of threading them through every call.
- Use `Context.Service` for capabilities supplied by callers. Use `Context.Reference` only for a genuinely meaningful default.
- Keep business operations in the service contract; keep acquisition, configuration, and dependency wiring in its `Layer`.
- Compose the layer graph once near the application boundary. Provide individual services only at narrow integration or test boundaries.

## Preserve lifetimes

- Use scoped layers for clients, pools, servers, subscriptions, and other acquired resources.
- Rely on layer memoization for shared instances. Use `Layer.fresh` only when independent acquisition is intentional.
- Keep construction failures typed and distinct from operation failures.
- Avoid reading a service while constructing the same service through a circular dependency; split the capability or graph.

## Keep substitution honest

- Supply test implementations through layers rather than branching production code.
- Prefer small contract-compatible fakes over mocks of internal calls.
- Expose the least capability consumers need.

Do not turn pure functions, request data, or every configurable value into a service.

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

- Give every service a unique stable identifier. Keep method environment
  requirements at `never`; resolve dependencies while constructing the layer so
  callers see only the declared capability.
- Default to one service class plus its inline readonly interface. Extract a
  named interface only when several implementations or public reuse make it
  clearer.
- One layer should construct one cohesive service. Merge independent layers;
  provide prerequisites into dependent layers.

## Compose once

- Keep a single application composition root. Feature modules export service
  contracts and Live/Test layers, not hidden runtime execution.
- Use `Layer.merge`/`mergeAll` for independent outputs and `Layer.provide` when
  one layer consumes another. Use `provideMerge` only when the prerequisite must
  remain available to the resulting environment.
- Reuse the same layer value when one acquisition should be memoized. Use
  `Layer.fresh` only to request an independent instance deliberately.
- For optional infrastructure, choose the Live or no-op/in-memory layer inside
  a factory while preserving the same output service contract.

## Own configuration, resources, and failure

- Read and validate configuration during layer construction. Redact secrets and
  provide typed configuration to the service.
- Use scoped layers for resources and pair every acquisition with an idempotent
  finalizer. Do not add manual cleanup paths beside Scope ownership.
- Keep layer construction failures typed and distinct from operation failures.
  A fallback layer must handle a named construction failure intentionally.
- Instrument service operations at meaningful boundaries and provide logger,
  tracer, or metrics layers at the application edge.

## Review checklist

- Each service owns one capability and exposes readonly operations.
- Method requirements do not leak implementation dependencies.
- Independent and dependent layers use the correct composition operator.
- Memoization, freshness, scope, configuration, and construction failure are
  explicit.
- Production and test implementations substitute through the same service key.
