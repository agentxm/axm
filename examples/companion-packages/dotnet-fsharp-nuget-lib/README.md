# .NET F# TinyFlags

This example shows how a NuGet package can ship companion AXM extensions for
its users. The package is a small F# feature flag library named
`AgentXM.Examples.TinyFlags.FSharp`.

The AXM extensions are published to AgentXM.ai under `@examples`. The NuGet
package uses the `AgentXM.Examples.*` package namespace.

The package ships AXM recommendations in an `axm.json` sidecar packed at the
NuGet package root:

```json
{
  "recommendedExtensions": ["@examples/packs/dotnet-fsharp-nuget-tinyflags@^0.1.0"]
}
```

When this package is installed in another project, `axm discover` can read
`~/.nuget/packages/agentxm.examples.tinyflags.fsharp/0.2.0/axm.json` and surface
the companion pack as a package-author recommendation.

A working consumer is in `../dotnet-fsharp-nuget-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── global.json                 SDK pin (rolls forward latest feature band)
├── Directory.Build.props       Shared MSBuild props (target framework, packaging)
├── Directory.Packages.props    Central package version management
├── .editorconfig               F# formatting conventions
├── *.slnx                      XML solution file (replaces legacy .sln)
├── axm.json                    Companion-extension recommendations
└── src/, test/                 Library and Expecto test project
```

## Build & test

```bash
dotnet build
dotnet test
```

`dotnet test` runs the Expecto suite in
`test/AgentXM.Examples.TinyFlags.FSharp.Tests` via the
[YoloDev.Expecto.TestSdk](https://www.nuget.org/packages/YoloDev.Expecto.TestSdk)
adapter.

## Library

The library lives in `src/AgentXM.Examples.TinyFlags.FSharp/TinyFlags.fs` and
exposes a module-first F# API:

- `Flag.Boolean(defaultValue, ?rollout)` — smart constructor
- `Flag.Variant(variants, ?defaultValue, ?rollout)` — smart constructor
- `TinyFlags.create`, `TinyFlags.enabled`, `TinyFlags.variant`, `TinyFlags.evaluate`
- `EvaluationContext.empty`
- `FlagValue` — typed result DU (`BoolValue` / `VariantValue`)

```fsharp
open AgentXM.Examples.TinyFlags.FSharp

let flags =
    TinyFlags.create [
        "checkoutRedesign", Flag.Boolean(defaultValue = true)
        "searchRanking",
        Flag.Variant(
            variants = [ "classic"; "semantic" ],
            rollout = Map.ofList [ "semantic", 100 ]
        )
    ]

let ctx = { EvaluationContext.empty with UserId = Some "user-1" }

flags |> TinyFlags.enabled "checkoutRedesign" ctx     // true
flags |> TinyFlags.variant "searchRanking" ctx        // "semantic"
flags |> TinyFlags.evaluate "searchRanking" ctx       // VariantValue "semantic"
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                             |
| -------- | --------------------------------------------------------------- |
| Skill    | `@examples/skills/dotnet-fsharp-nuget-tinyflags-add-flag`       |
| Skill    | `@examples/skills/dotnet-fsharp-nuget-tinyflags-rollout-review` |
| Skill    | `@examples/skills/dotnet-fsharp-nuget-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/dotnet-fsharp-nuget-tinyflags-maintainer`  |
| Pack     | `@examples/packs/dotnet-fsharp-nuget-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:nuget/agentxm.examples.tinyflags.fsharp@0.2.0` as its companion
package.

## Scenario

A NuGet package author can use this layout as a model:

1. Implement the normal .NET package.
2. Pack `axm.json` into the NuGet package root.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
