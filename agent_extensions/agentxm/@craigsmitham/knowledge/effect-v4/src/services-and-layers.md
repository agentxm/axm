---
type: Checklist
title: Services and layers
description: Evaluate whether capabilities, implementations, dependency graphs, lifetimes, and runtime boundaries remain explicit and replaceable.
tags: [effect, effect-v4, context, service, layer, dependency-injection]
status: stable
sources:
  - id: effect-services
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/03_services/01_service.ts
    title: Effect 4.0.0-rc.112 service basics
  - id: effect-layers
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/03_services/20_layer-composition.ts
    title: Effect 4.0.0-rc.112 layer composition
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts
    title: opencode application layer composition at dc4449d
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Services and layers

- [ ] Define one coherent capability per service tag with the smallest interface
  callers need, rather than exposing a concrete client or global singleton.
- [ ] Make each method's success, expected error, and service requirements
  truthful in its Effect type.
- [ ] Keep implementation construction, configuration, resource acquisition,
  and dependencies in a layer instead of hiding them in service methods.
- [ ] Compose layers so requirements are satisfied once and the exposed output
  contains only the services downstream code should depend on.
- [ ] Process, request, and short-lived resources are built in the scope that
  owns their actual lifetime.
- [ ] Provide production layers at an application boundary rather than
  repeatedly deep inside business logic.
- [ ] Exhaust or translate the expected error channel before handing a program
  to a runtime that requires `E = never`; do not erase failures mechanically.
- [ ] Test through the same service tag with a deterministic substitute, and
  include layer construction and finalization where those can fail.

## Resources

- [Service basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/03_services/01_service.ts)
- [Layer composition](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/ai-docs/src/01_effect/03_services/20_layer-composition.ts)
- [Applied layer graph in opencode](https://github.com/anomalyco/opencode/blob/dc4449df0d52199704ea4989a5a993ebbc605612/packages/stats/server/src/server.ts)
