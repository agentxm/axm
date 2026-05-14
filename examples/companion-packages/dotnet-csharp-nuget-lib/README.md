# .NET C# TinyFlags

This example shows how a NuGet package can ship companion AXM extensions for
its users. The package is a small C# feature flag library named
`AgentXM.Examples.TinyFlags.CSharp`.

The AXM extensions are published to AgentXM.ai under `@examples`. The NuGet
package uses the `AgentXM.Examples.*` namespace.

The package ships AXM recommendations in an `axm.json` sidecar packed at the
NuGet package root:

```json
{
  "recommendedExtensions": ["@examples/packs/dotnet-csharp-nuget-tinyflags@^0.1.0"]
}
```

When this package is installed in another project, `axm discover` can read
`~/.nuget/packages/agentxm.examples.tinyflags.csharp/0.1.0/axm.json` and surface
the companion pack as a package-author recommendation.

A working consumer is in `../dotnet-csharp-nuget-app/` (the `pawmatch` CLI).

## Package

Targets `net10.0`. Solution is `.slnx`. Shared MSBuild settings live in
`Directory.Build.props`; package versions are managed centrally in
`Directory.Packages.props`.

```bash
dotnet test
```

The library lives in `src/AgentXM.Examples.TinyFlags.CSharp/TinyFlags.cs` and exposes:

- `TinyFlag.Boolean(...)`
- `TinyFlag.Variant(...)` — accepts `ReadOnlySpan<string>` (collection-expression friendly)
- `TinyFlags.Create(...)`
- `TinyFlags.Evaluate(...)` — returns a `FlagValue` discriminated union (`Bool` / `Variant`)

Tests use [xUnit v3](https://xunit.net) on Microsoft.Testing.Platform.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                             |
| -------- | --------------------------------------------------------------- |
| Skill    | `@examples/skills/dotnet-csharp-nuget-tinyflags-add-flag`       |
| Skill    | `@examples/skills/dotnet-csharp-nuget-tinyflags-rollout-review` |
| Skill    | `@examples/skills/dotnet-csharp-nuget-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/dotnet-csharp-nuget-tinyflags-maintainer`  |
| Pack     | `@examples/packs/dotnet-csharp-nuget-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:nuget/agentxm.examples.tinyflags.csharp@0.1.0` as its companion
package.

## Scenario

A NuGet package author can use this layout as a model:

1. Implement the normal .NET package.
2. Pack `axm.json` into the NuGet package root.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
