---
type: Checklist
title: Services and layers
description: Evaluate whether capabilities, implementations, dependency graphs, lifetimes, and runtime boundaries remain explicit and replaceable.
tags: [effect, effect-v4, context, service, layer, dependency-injection]
status: stable
sources:
  - id: effect-services
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/03_services/01_service.ts
    title: Effect 4.1.0 service basics
  - id: effect-layers
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/03_services/20_layer-composition.ts
    title: Effect 4.1.0 layer composition (SQL example requires correction)
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts
    title: Historical opencode layer composition at dc4449d (Effect 4.0.0-beta.83)
  - id: applied-opencode-version
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/package.json
    title: opencode Effect beta.83 catalog at dc4449d
  - id: effect-sql-statements
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/src/sql/Statement.ts
    title: Effect 4.1.0 SQL parameter compilation
  - id: effect-functions
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/01_basics/02_effect-fn.ts
    title: Effect 4.1.0 reusable generator functions
  - id: effect-crypto
    resource: https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/CHANGELOG.md#410
    title: Effect 4.1.0 crypto provisioning migration
generated: { by: codex/gpt-6, at: 2026-10-29T19:51:52Z }
---

# Services and layers

- [ ] Define one coherent capability per `Context.Service` with a stable,
  package/path-qualified identifier and the smallest public interface callers
  need, rather than exposing a concrete adapter.[^effect-services]
- [ ] Make each method's success, expected error, and service requirements
  truthful in its Effect type.
- [ ] Keep implementation construction, configuration, resource acquisition,
  and dependencies in a layer instead of hiding them in service methods;
  follow local placement conventions for static members, exported layers, or
  dependency-open factories.[^effect-layers]
- [ ] Use `Effect.fn("Operation.name")` for reusable generator functions at
  meaningful tracing boundaries and `Effect.fnUntraced` when no span is needed;
  keep pure helpers ordinary functions and one-off programs as Effect
  values.[^effect-functions]
- [ ] Compose layers so requirements are satisfied once and the exposed output
  contains only services downstream code needs; keep public layer inputs,
  outputs, and construction failures inspectable.[^effect-layers]
- [ ] Process, request, and short-lived resources are built in the scope that
  owns their actual lifetime.
- [ ] Provide production layers at an application boundary rather than
  repeatedly deep inside business logic; explicitly provide required crypto
  family layers, which are no longer included in platform `*Services`
  bundles.[^effect-crypto]
- [ ] Exhaust or translate the expected error channel before handing a program
  to a runtime that requires `E = never`; do not erase failures mechanically.
- [ ] Test through the same service tag with a deterministic substitute, and
  include layer construction and finalization where those can fail.

## Resources

- [Service basics](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/03_services/01_service.ts)
- [Layer composition (composition example only)](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/03_services/20_layer-composition.ts) —
  its `findById` SQL incorrectly quotes `${id}`. Remove those SQL quotes:
  the tagged template supplies a placeholder and bind value, and quoting the
  placeholder makes it a string literal.[^effect-sql-statements] Decode selected
  rows as described in [SQL](sql.md); the sample's generic row type does not
  validate them.
- [Historical layer graph in opencode (Effect beta.83)](https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts) —
  conceptual composition evidence only. Its `Config.number`, `Config.string`,
  and `effect/unstable/http` import predate released v4.[^applied-opencode-version]

[^effect-services]: Effect service interfaces and namespaced identifiers.
[^effect-layers]: Effect layer composition and public requirements.

[^effect-functions]: [Effect 4.1.0 reusable generator functions](https://github.com/Effect-TS/effect/blob/effect%404.1.0/ai-docs/src/01_effect/01_basics/02_effect-fn.ts).

[^applied-opencode-version]: opencode Effect beta.83 catalog at dc4449d.
[^effect-sql-statements]: Effect SQL parameter compilation.

[^effect-crypto]: [Effect crypto provisioning migration](https://github.com/Effect-TS/effect/blob/effect%404.1.0/packages/effect/CHANGELOG.md#410).
