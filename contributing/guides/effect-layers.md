---
status: active
last-reviewed: 2026-08-17
version: 0.3.0
description: Consult when composing the AXM CLI runtime or providing command dependencies. Defines AXM-only entry-point and command-provision policy.
depends-on:
  - ./effect.md
---

# Effect Layers in AXM

Portable service, layer, resource, configuration, testing, and observability
patterns belong to the Effect v4 Knowledge guides for
[services and layers](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/services-and-layers.md)
and [resource safety](../../.axm/extensions/@craigsmitham/knowledge/effect-v4/src/resource-safety.md),
routed by the installed `craft-effect-v4` skill. This guide owns AXM CLI
composition only.

## CLI composition

- Use `runCliMain` from `@agentxm/client-core` as the production entry point.
  It owns signal handling, error routing, and graceful shutdown.
- Provide shared layers once at the `Command.run` / `Command.runWith` edge.
- Let deferred Plan steps retain their service requirements in `R`; provide
  the complete Plan at the command edge. Return values needed after execution
  through typed `JobStepResult` output rather than captured mutable variables.
- Use `Command.provide` when a subcommand needs a distinct or
  configuration-dependent layer.
- Use `Command.provideSync` or `Command.provideEffect` for one service
  implementation. AXM uses `Command.provideSync` for command-argv tracking.
- Validate configuration with Schema while constructing the layer; do not use
  raw `Config.mapOrFail` as the validation boundary.

```ts
const deploy = Command.make("deploy", { environment }, handler).pipe(
  Command.provide(({ environment }) =>
    environment === "production" ? ProductionLayer : DevelopmentLayer,
  ),
);
```

## Checklist

- [ ] Production entry point is `runCliMain`.
- [ ] Shared dependencies are provided once at the command edge.
- [ ] Subcommand-specific layers use `Command.provide`.
- [ ] Single services use `Command.provideSync` or `Command.provideEffect`.
- [ ] Layer construction schema-validates configuration.
