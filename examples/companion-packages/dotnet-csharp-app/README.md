# PawMatch (.NET C# consumer app)

`pawmatch` is a tiny .NET C# CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `AgentXM.Examples.TinyFlags.CSharp`
library — exactly the codebase the companion AXM skills and subagent in
`../dotnet-csharp-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`dotnet-csharp-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/dotnet-csharp-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- browse
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- show pepper
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- match --has-kids --active
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- apply biscuit
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- fees
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- return-support
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- donate
dotnet run --project src/AgentXM.Examples.PawMatch.CSharp -- donate brother-wolf --open
```

## Library dependency

The app consumes the `AgentXM.Examples.TinyFlags.CSharp` library from NuGet
via a `<PackageReference>`:

```xml
<PackageReference Include="AgentXM.Examples.TinyFlags.CSharp" Version="0.1.0" />
```

The sibling `../dotnet-csharp-lib/` is the source of that package but is not
referenced directly.

## Flag seams

Flag definitions live in `Flags.cs`. Each is wired into at least one command so
the companion skills have realistic targets:

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

Rollouts are deterministic per user (the CLI uses `Environment.UserName` as the
`SessionId`), so running the same command twice produces the same flag values.

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
independently before giving. See `Charities.cs`.
