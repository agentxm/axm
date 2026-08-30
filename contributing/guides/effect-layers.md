---
status: active
last-reviewed: 2026-08-17
version: 0.4.0
description: Consult when composing the AXM CLI runtime or providing command dependencies. Defines AXM-only entry-point and command-provision policy.
depends-on:
  - ./effect.md
---

# Effect Layers in AXM

Portable service, layer, resource, configuration, testing, and observability
patterns belong to the Effect v4 Knowledge guides for
[services and layers](../../agent_extensions/agentxm/@craigsmitham/knowledge/effect-v4/src/services-and-layers.md)
and [resource safety](../../agent_extensions/agentxm/@craigsmitham/knowledge/effect-v4/src/resource-safety.md).
This guide owns AXM CLI
composition only.

## CLI composition

- Use `runCliMain` from `@agentxm/extension-management` as the production entry point.
  It owns signal handling, error routing, and graceful shutdown.
- Treat `withRuntime` and, for workspace commands, `withWorkspace` as the
  sanctioned command edge. They resolve the selected directory and workspace,
  compose invocation-scoped layers, and preserve the `AppError |
PromptCancelled` boundary before `runCliMain`.
- Provide process-wide layers once at the `Command.run` / `Command.runWith`
  edge. Do not rebuild them in handlers.
- Let deferred Plan steps retain their service requirements in `R`; provide
  the complete Plan at the command edge. Return values needed after execution
  through typed `JobStepResult` output rather than captured mutable variables.
- Use `Command.provide` only when a command-tree service belongs before the
  handler and differs by parsed command configuration. It is not a replacement
  for `withRuntime` or `withWorkspace`.
- Use `Command.provideSync` or `Command.provideEffect` for one service
  implementation. AXM uses `Command.provideSync` for command-argv tracking.
- Validate individual values with Schema while constructing the layer. Use
  `Config.mapOrFail` for rules spanning settings, returning a typed
  `ConfigError`; do not use it to replace a value's owning schema.

```ts
const deploy = Command.make("deploy", { environment }, handler).pipe(
  Command.provide(({ environment }) =>
    environment === "production" ? ProductionLayer : DevelopmentLayer,
  ),
);
```

## Checklist

- [ ] Production entry point is `runCliMain`.
- [ ] `withRuntime` / `withWorkspace` own invocation-scoped command layers.
- [ ] Shared process dependencies are provided once at the run edge.
- [ ] Command-tree-only services use `Command.provide` when parsed
      configuration selects their layer.
- [ ] Single services use `Command.provideSync` or `Command.provideEffect`.
- [ ] Layer construction schema-validates configuration.
