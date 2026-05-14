# Companion Package Examples

This directory demonstrates how libraries and applications can publish
companion AXM extensions for their users. Each ecosystem example pairs a small
library (`*-lib`) with a tiny consumer application (`*-app`) that uses it, and
both publish their own companion AXM extension set.

The example extensions are published under the AgentXM.ai `@examples` owner
namespace. The ecosystem packages they support are published under the
appropriate `agentxm` package namespace for that ecosystem.

Each ecosystem package also embeds package-native AXM recommendation metadata.
For npm, this is the `axm.recommendedExtensions` field in `package.json`. For
NuGet, this is an `axm.json` sidecar shipped in the package root. For PyPI,
this is a `[tool.axm]` table in `pyproject.toml`. The package-side metadata
recommends the companion pack, while the extension-side manifests use
`companionPackages` to point back to the package.

## Layout

For each ecosystem, two sibling directories at this level:

- `<language>-<registry>-lib/` — the library package and its authored AXM extensions
- `<language>-<registry>-app/` — a tiny consumer CLI that imports the library and is the
  exact codebase the companion skills are designed to operate on

| Status | Library                    | Consumer app               |
| ------ | -------------------------- | -------------------------- |
| ✅     | `dart-pub-lib/`            | `dart-pub-app/`            |
| ✅     | `dotnet-csharp-nuget-lib/` | `dotnet-csharp-nuget-app/` |
| ✅     | `dotnet-fsharp-nuget-lib/` | `dotnet-fsharp-nuget-app/` |
| ✅     | `elixir-hex-lib/`          | `elixir-hex-app/`          |
| ✅     | `go-gomod-lib/`            | `go-gomod-app/`            |
| ✅     | `java-maven-lib/`          | `java-maven-app/`          |
| ✅     | `javascript-npm-lib/`      | `javascript-npm-app/`      |
| ✅     | `kotlin-maven-lib/`        | `kotlin-maven-app/`        |
| ✅     | `php-composer-lib/`        | `php-composer-app/`        |
| ✅     | `python-pypi-lib/`         | `python-pypi-app/`         |
| ✅     | `ruby-rubygems-lib/`       | `ruby-rubygems-app/`       |
| ✅     | `rust-cargo-lib/`          | `rust-cargo-app/`          |
| ✅     | `scala-maven-lib/`         | `scala-maven-app/`         |
| ✅     | `swift-cocoapods-lib/`     | `swift-cocoapods-app/`     |
| ✅     | `swift-spm-lib/`           | `swift-spm-app/`           |

## Package Naming

Pick the most idiomatic name in each ecosystem rather than forcing
cross-ecosystem uniformity.

| Ecosystem         | Library                                 | App                                    |
| ----------------- | --------------------------------------- | -------------------------------------- |
| Cargo / crates.io | `agentxm-example-tinyflags`             | `agentxm-example-pawmatch`             |
| CocoaPods         | `AgentXMExampleTinyFlags`               | `AgentXMExamplePawMatch`               |
| Composer / PHP    | `agentxm/example-tinyflags`             | `agentxm/example-pawmatch`             |
| .NET / NuGet      | `AgentXM.Examples.TinyFlags.CSharp`     | `AgentXM.Examples.PawMatch.CSharp`     |
| .NET / NuGet      | `AgentXM.Examples.TinyFlags.FSharp`     | `AgentXM.Examples.PawMatch.FSharp`     |
| Go modules        | `github.com/agentxm/example-tinyflags`  | `github.com/agentxm/example-pawmatch`  |
| Hex / Elixir      | `agentxm_example_tinyflags`             | `agentxm_example_pawmatch`             |
| Maven / Java      | `ai.agentxm.examples:tinyflags-java`    | `ai.agentxm.examples:pawmatch-java`    |
| Maven / Kotlin    | `ai.agentxm.examples:tinyflags-kotlin`  | `ai.agentxm.examples:pawmatch-kotlin`  |
| Maven / Scala     | `ai.agentxm.examples:tinyflags-scala_3` | `ai.agentxm.examples:pawmatch-scala_3` |
| npm               | `@agentxm/example-tinyflags`            | `@agentxm/example-pawmatch`            |
| Pub / Dart        | `agentxm_example_tinyflags`             | `agentxm_example_pawmatch`             |
| PyPI              | `agentxm-example-tinyflags`             | `agentxm-example-pawmatch`             |
| RubyGems          | `agentxm-example-tinyflags`             | `agentxm-example-pawmatch`             |
| Swift / SwiftPM   | `AgentXMExampleTinyFlags`               | `AgentXMExamplePawMatch`               |

Conventions:

- **Cargo / crates.io** uses the `agentxm-example-` crate-name prefix (kebab-
  case is conventional). The library's `lib` target is named `tinyflags` so
  consumers `use tinyflags::...`.
- **CocoaPods** uses a PascalCase pod name (no namespace — CocoaPods Specs is a
  flat global registry). The consumer is a minimal Swift command-line target
  that links the pod; a real consumer would typically be an iOS/macOS app with
  an `xcodeproj` integration.
- **Composer / PHP** uses the `agentxm/example-tinyflags` vendor/package
  format. The PSR-4 autoload namespace is `AgentXM\Examples\TinyFlags\`.
- **.NET** uses the `AgentXM.Examples.*` PascalCase hierarchy. Plural
  `Examples` follows the Framework Design Guidelines ("DO use plural namespace
  names where appropriate") and aligns with the `@examples` AXM owner. The
  `.CSharp` / `.FSharp` suffix distinguishes the two language ports.
- **Hex / Elixir** uses lowercase snake_case package names
  (`agentxm_example_tinyflags`) per Hex conventions. The AXM recommendation
  ships as an `axm.json` sidecar; the Hex reader's `extra.axm` fallback in
  `hex_metadata.config` is an idiomatic alternative but not exercised here.
- **Maven / Java** uses the reverse-DNS group id `ai.agentxm.examples` with
  short, lowercase artifact ids (`tinyflags-java`, `pawmatch-java`). The
  `-java` suffix distinguishes the language port from the Kotlin and Scala
  siblings on the same group id.
- **Maven / Kotlin** uses the reverse-DNS group id `ai.agentxm.examples` with
  short, lowercase artifact ids (`tinyflags-kotlin`, `pawmatch-kotlin`). The
  `-kotlin` suffix distinguishes the language port from the Java and Scala
  siblings on the same group id.
- **Maven / Scala** uses the reverse-DNS group id with the Scala 3 binary-
  compat suffix `_3` (`tinyflags-scala_3`, `pawmatch-scala_3`). The example
  uses `pom.xml` rather than `build.sbt` so it actually exercises the AXM
  Maven detector; production Scala projects typically use sbt.
- **npm** uses the `@agentxm` scope with a singular `example-` prefix, matching
  the convention used by Vercel, Storybook, Babel, and Microsoft scoped sample
  packages.
- **Pub / Dart** uses lowercase snake*case package names per Pub's
  `[a-z0-9*]+` naming rule.
- **PyPI** uses an `agentxm-example-` distribution-name prefix while keeping
  the import name clean (`import tinyflags`).
- **RubyGems** uses an `agentxm-example-` gem-name prefix (kebab-case). The
  AXM recommendation is embedded as a stringified array in
  `spec.metadata["axm_recommended_extensions"]`.
- **Swift / SwiftPM** uses PascalCase product names. Because SwiftPM
  identifies packages by URL, the example uses a placeholder host
  `example.com/agentxm/example-tinyflags-swift` rather than a real GitHub
  URL — the resulting purl is
  `pkg:swift/example.com/agentxm/example-tinyflags-swift`.
- **AXM extensions** are always owned by `@examples` regardless of ecosystem.

Apps are not packable / not publishable — they are reference consumers, not
distributed packages.

## Library — TinyFlags

The library, `TinyFlags`, is a minimal feature flag package with the same
behavior in every ecosystem:

- Define boolean flags with defaults and optional percentage rollouts.
- Define variant flags with allowed values, a default value, and optional
  percentage allocations.
- Evaluate flags with a request or user context.
- Use deterministic bucketing so a context receives stable rollout decisions.
- Include tests that prove default behavior, rollout boundaries, and validation.

The API feels native in each ecosystem. JavaScript uses ES modules and Node's
built-in test runner. .NET examples use framework-native test projects. Python
uses pytest.

## Consumer App — PawMatch

`pawmatch` is a tiny CLI for a fictional community pet adoption center. It
exercises TinyFlags through realistic seams so the companion skills have
concrete code to operate on.

### Ethical framing

The domain follows mainstream pet-adoption best practices so that example code
does not model patterns that real-world animal welfare orgs discourage:

- **Adopt, don't shop** — framed as a shelter / rescue center, not retail.
- **Matching over transacting** — adoption is conversation- and questionnaire-
  driven (see ASPCA "Meet Your Match"), not one-click checkout.
- **Hold and meet-and-greet periods are a feature**, not friction to flag-off.
- **Transparent adoption fees** — fees cover spay/neuter, vaccines, microchip.
- **No-judgment returns and post-adoption support** are first-class.
- **Long-stay animals** are surfaced because they are hardest to place.

### Commands

- `pawmatch browse [--species dog|cat|...]` — list available adoptable pets
- `pawmatch show <pet>` — pet detail (personality, needs, time-in-shelter)
- `pawmatch match` — short lifestyle questionnaire, suggested matches
- `pawmatch apply <pet>` — start an adoption application (records meet-and-greet, hold period)
- `pawmatch fees` — transparent breakdown of what adoption fees cover
- `pawmatch return-support` — no-judgment return policy and post-adoption help
- `pawmatch donate [--focus shelters|rescue|policy|all]` — curated list of
  highly-rated animal welfare charities with their official donation URLs
- `pawmatch donate <slug> --open` — open that charity's official donation page

### Flag seams

Each flag is wired into at least one command's code path so the companion
skills (`add-flag`, `rollout-review`, `cleanup-flag`) have realistic work.

**Boolean flags**

| Flag                            | Used in  | Notes                                     |
| ------------------------------- | -------- | ----------------------------------------- |
| `home-check-followup`           | `apply`  | Rollout candidate (2-week follow-up)      |
| `fee-breakdown-detailed`        | `fees`   | Itemized vs. summary breakdown            |
| `long-stay-highlight`           | `browse` | Surface a long-stay animal in listings    |
| `suggest-donate-after-adoption` | `apply`  | Gentle donate suggestion at end of flow   |
| `show-charity-ratings`          | `donate` | Inline rating badges vs. footer link only |

**Variant flags**

| Flag                      | Used in  | Variants                                     |
| ------------------------- | -------- | -------------------------------------------- |
| `recommendation-strategy` | `match`  | `popularity` / `match-quiz` / `longest-stay` |
| `match-quiz-depth`        | `match`  | `short` / `standard` / `thorough`            |
| `pet-card-style`          | `browse` | `compact` / `detailed` / `playful`           |
| `donate-focus-default`    | `donate` | `all` / `shelters` / `rescue`                |

### Charities

The `donate` command shows a curated, static list of well-known, highly-rated
animal welfare organizations (4-star Charity Navigator and/or Platinum
GuideStar at the time of curation). The list is example data — every output
includes a footer reminder to verify ratings independently before giving.
Pawmatch does not process payments; it shows information and links to each
organization's official donation page.

## Extension Sets

Each ecosystem example ships two companion extension sets — one for the
library and one for the app — to demonstrate that both packages and
applications can publish AXM extensions for their users.

All example extensions use owner `@examples`. Extension names are prefixed by
language, registry, and target, for example
`dotnet-csharp-nuget-tinyflags-add-flag` and
`dotnet-csharp-nuget-pawmatch-find-a-pet`.

### Library extensions — TinyFlags

Companion extensions for developers using the library. Each ecosystem example
includes these extension roles:

- Add flag skill: guides users through adding a TinyFlags flag with tests.
- Rollout review skill: reviews rollout safety and ecosystem package details.
- Cleanup skill: removes stale flags without leaving dead references.
- Maintainer subagent: performs focused TinyFlags design and implementation
  review.
- Companion pack: installs the skills and subagent together.

The TinyFlags package embeds a recommendation for the companion pack, and each
of these extensions declares a `companionPackages` Package URL pointing back
to the TinyFlags ecosystem package.

### App extension — PawMatch

A single companion skill for end users driving the CLI in agentic workflows.
Demonstrates the minimum viable companion extension for an application — one
focused skill, no subagent, no pack:

- `find-a-pet` skill: walks an agent through `pawmatch browse`, `match`,
  `show`, and `apply` to help an end user identify candidate pets and start
  an adoption application. Reads the user's stated preferences, runs the
  questionnaire, surfaces long-stay animals when relevant, and explains
  adoption fees and the meet-and-greet / hold period before applying.

PawMatch itself is not publishable (see [Layout](#layout)), so the skill is
not wired to a `companionPackages` Package URL. It demonstrates the shape an
app maintainer would ship if their CLI were published — a single, focused
end-user skill that drives the app's commands.
