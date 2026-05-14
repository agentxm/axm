# PawMatch (.NET F# consumer app)

`pawmatch` is a tiny .NET F# CLI for a fictional community pet adoption
center. It is a reference _consumer_ of the `AgentXM.Examples.TinyFlags.FSharp`
library — exactly the codebase the companion AXM skills and subagent in
`../dotnet-fsharp-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`dotnet-fsharp-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/dotnet-fsharp-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- browse
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- show pepper
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- match --has-kids --active
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- apply biscuit
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- fees
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- return-support
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- donate
dotnet run --project src/AgentXM.Examples.PawMatch.FSharp -- donate brother-wolf --open
```

## Library dependency

The app consumes the `AgentXM.Examples.TinyFlags.FSharp` library via a
`<PackageReference>`:

```xml
<PackageReference Include="AgentXM.Examples.TinyFlags.FSharp" Version="0.2.0" />
```

Until the renamed `0.2.0` package is published to nuget.org, this directory's
`NuGet.config` points at the sibling lib's local `artifacts/` directory:

```xml
<add key="local-fsharp-lib" value="../dotnet-fsharp-lib/artifacts" />
```

Run `dotnet pack` in `../dotnet-fsharp-lib/` first so the `.nupkg` is on disk.
Once the published version replaces the local one, the local feed entry can
be removed.

## CLI parser

The CLI uses [Argu](https://fsprojects.github.io/Argu/), the F#-canonical
discriminated-union argument parser. Subcommands are modelled as cases of
`PawMatchCommand`; per-subcommand flags as their own DUs (see
`PawMatchCli.fs`).

## Flag seams

Flag definitions live in `Flags.fs`. Each is wired into at least one command
so the companion skills have realistic targets:

| Flag                            | Type    | Used in  |
| ------------------------------- | ------- | -------- |
| `home-check-followup`           | bool    | `apply`  |
| `fee-breakdown-detailed`        | bool    | `fees`   |
| `long-stay-highlight`           | bool    | `browse` |
| `suggest-donate-after-adoption` | bool    | `apply`  |
| `show-charity-ratings`          | bool    | `donate` |
| `recommendation-strategy`       | variant | `match`  |
| `match-quiz-depth`              | variant | `match`  |
| `pet-card-style`                | variant | `browse` |
| `donate-focus-default`          | variant | `donate` |

Rollouts are deterministic per user (the CLI uses `Environment.UserName` as
the `SessionId`), so running the same command twice produces the same flag
values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not a
retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines, microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI never
processes payments. Every output includes a disclaimer to verify ratings
independently before giving. See `Charities.fs`.

## Test

```bash
dotnet test
```

The Expecto smoke test in `test/AgentXM.Examples.PawMatch.FSharp.Tests`
asserts that `pawmatch fees` exits 0.
