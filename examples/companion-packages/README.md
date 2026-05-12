# Companion Package Examples

This directory demonstrates how a library or framework can publish companion
AXM extensions for its users. Each ecosystem example implements the same tiny
feature flag library and ships matching skills, a subagent, and a pack.

The example extensions are published under the AgentXM.ai `@examples` owner
namespace. The ecosystem packages they support are published under the
appropriate `agentxm` package namespace for that ecosystem, such as the npm
scope `@agentxm`, and their package names include `example`.

Each ecosystem package also embeds package-native AXM recommendation metadata.
For npm, this is the `axm.recommendedExtensions` field in `package.json`. For
NuGet, this is an `axm.json` sidecar shipped in the package root. The
package-side metadata recommends the companion pack, while the extension-side
manifests use `companionPackages` to point back to the package.

## Functional Spec

The sample library is `TinyFlags`, a minimal feature flag package with the same
behavior in every ecosystem:

- Define boolean flags with defaults and optional percentage rollouts.
- Define variant flags with allowed values, a default value, and optional
  percentage allocations.
- Evaluate flags with a request or user context.
- Use deterministic bucketing so a context receives stable rollout decisions.
- Include tests that prove default behavior, rollout boundaries, and validation.

The API should feel native in each ecosystem. JavaScript uses ES modules and
Node's built-in test runner. .NET examples use framework-native test projects.

## Extension Set

Each ecosystem example includes these extension roles:

- Add flag skill: guides users through adding a TinyFlags flag with tests.
- Rollout review skill: reviews rollout safety and ecosystem package details.
- Cleanup skill: removes stale flags without leaving dead references.
- Maintainer subagent: performs focused TinyFlags design and implementation
  review.
- Companion pack: installs the skills and subagent together.

All example extensions use owner `@examples`. Extension names are prefixed by
ecosystem, for example `npm-javascript-tinyflags-add-flag`.

Each package embeds a recommendation for its companion pack, and each extension
manifest declares a `companionPackages` Package URL for the ecosystem package it
supports.

## Examples

- `npm-javascript/` — npm package example for `@agentxm/example-tinyflags`.
- `dotnet-csharp/` — NuGet C# package example for `AgentXM.Example.TinyFlags.CSharp`.
- `dotnet-fsharp/` — NuGet F# package example for `AgentXM.Example.TinyFlags.FSharp`.
