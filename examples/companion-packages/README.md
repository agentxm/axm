# Companion Package Examples

This directory demonstrates how a library or framework can publish companion
AXM extensions for its users. Each ecosystem example pairs a small library
(`*-lib`) with a tiny consumer application (`*-app`) that uses it.

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

- `<ecosystem>-lib/` — the library package and its authored AXM extensions
- `<ecosystem>-app/` — a tiny consumer CLI that imports the library and is the
  exact codebase the companion skills are designed to operate on

| Status | Library                            | Consumer app          |
| ------ | ---------------------------------- | --------------------- |
| ✅     | `dotnet-csharp-lib/`               | `dotnet-csharp-app/`  |
| ⏳     | `npm-javascript/` (rename pending) | `npm-javascript-app/` |
| ⏳     | `dotnet-fsharp/` (rename pending)  | `dotnet-fsharp-app/`  |
| ⏳     | `pypi-python/` (rename pending)    | `pypi-python-app/`    |

## Package Naming

Pick the most idiomatic name in each ecosystem rather than forcing
cross-ecosystem uniformity.

| Ecosystem    | Library                             | App                                |
| ------------ | ----------------------------------- | ---------------------------------- |
| .NET / NuGet | `AgentXM.Examples.TinyFlags.CSharp` | `AgentXM.Examples.PawMatch.CSharp` |
| .NET / NuGet | `AgentXM.Examples.TinyFlags.FSharp` | `AgentXM.Examples.PawMatch.FSharp` |
| npm          | `@agentxm/example-tinyflags`        | `@agentxm/example-pawmatch`        |
| PyPI         | `agentxm-example-tinyflags`         | `agentxm-example-pawmatch`         |

Conventions:

- **.NET** uses the `AgentXM.Examples.*` PascalCase hierarchy. Plural
  `Examples` follows the Framework Design Guidelines ("DO use plural namespace
  names where appropriate") and aligns with the `@examples` AXM owner. The
  `.CSharp` / `.FSharp` suffix distinguishes the two language ports.
- **npm** uses the `@agentxm` scope with a singular `example-` prefix, matching
  the convention used by Vercel, Storybook, Babel, and Microsoft scoped sample
  packages.
- **PyPI** uses an `agentxm-example-` distribution-name prefix while keeping
  the import name clean (`import tinyflags`).
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

## Extension Set

Each ecosystem example includes these extension roles:

- Add flag skill: guides users through adding a TinyFlags flag with tests.
- Rollout review skill: reviews rollout safety and ecosystem package details.
- Cleanup skill: removes stale flags without leaving dead references.
- Maintainer subagent: performs focused TinyFlags design and implementation
  review.
- Companion pack: installs the skills and subagent together.

All example extensions use owner `@examples`. Extension names are prefixed by
ecosystem, for example `dotnet-csharp-tinyflags-add-flag`.

Each package embeds a recommendation for its companion pack, and each extension
manifest declares a `companionPackages` Package URL for the ecosystem package
it supports.
