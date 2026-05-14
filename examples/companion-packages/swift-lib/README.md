# Swift TinyFlags

This example shows how a SwiftPM package can ship companion AXM extensions for
its users. The package is a small Swift feature flag library named
`AgentXMExampleTinyFlags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Swift
package uses an `example.com/agentxm/example-tinyflags-swift` placeholder
namespace — see [Placeholder host](#placeholder-host) below.

## Package metadata sidecar

The package ships AXM recommendations in an `axm.json` sidecar at the package
root:

```json
{
  "recommendedExtensions": ["@examples/packs/swift-tinyflags@^0.1.0"]
}
```

SwiftPM resolves dependencies into `.build/checkouts/<package-name>/` in the
consumer's build directory. The AXM Swift reader looks up
`.build/checkouts/<package-name>/axm.json` after resolution. Because the
sidecar is at the package root (not inside `Sources/`), SwiftPM places it
exactly where the reader expects.

When this package is added as a dependency in another project and the consumer
runs `swift package resolve`, `axm discover` can read
`<consumer>/.build/checkouts/example-tinyflags-swift/axm.json` and surface the
companion pack as a package-author recommendation.

A working consumer is in `../swift-app/` (the `pawmatch` CLI).

## Placeholder host

Swift Package Manager uses URL-based dependency identity. A real dependency
typically uses `https://github.com/<org>/<repo>.git`, and the AXM Swift
detector splits the URL into `{host}/{org}` as the namespace and the repo as
the name. The resulting package URL is
`pkg:swift/<host>/<org>/<name>@<version>`.

We deliberately use `https://example.com/agentxm/example-tinyflags-swift.git`
in this example rather than a `github.com` host so the namespace does not
imply a real GitHub repository. The resulting purl is
`pkg:swift/example.com/agentxm/example-tinyflags-swift@<version>`. The companion
extension manifests reference this purl in their `companionPackages` array.

## Layout

```text
.
├── Package.swift                  SwiftPM manifest (library product)
├── axm.json                       Companion-extension recommendations
├── Sources/AgentXMExampleTinyFlags/
│                                  Library sources (Foundation only)
└── Tests/AgentXMExampleTinyFlagsTests/
                                   XCTest suite
```

## Build & test

```bash
swift build
swift test
```

Tests are written in XCTest for portability across the command-line Swift
toolchain and Xcode. Swift Testing (`import Testing`) is an idiomatic
alternative on toolchains that bundle it; each XCTest method maps
one-for-one to a Swift Testing `@Test func`.

## Library

The library lives in `Sources/AgentXMExampleTinyFlags/TinyFlags.swift` and
exposes:

- `TinyFlags.builder()` — registers definitions by name.
- `Flag.boolean(default:rollout:)` / `Flag.variant(_:default:rollout:)` —
  smart constructors that validate input.
- `EvaluationContext(identifier:)` / `EvaluationContext.session(_:)` —
  caller identity for deterministic bucketing.
- `flags.enabled(_:context:)`, `flags.variant(_:context:)`, and
  `flags.evaluate(_:context:)` — typed evaluation.

```swift
import AgentXMExampleTinyFlags

let flags = try TinyFlags.builder()
    .boolean("checkoutRedesign", default: true)
    .variant(
        "searchRanking",
        variants: ["classic", "semantic"],
        default: "classic",
        rollout: ["semantic": 100]
    )
    .build()

let context = EvaluationContext.session("user-1")
try flags.enabled("checkoutRedesign", context: context)   // true
try flags.variant("searchRanking", context: context)      // "semantic"
try flags.evaluate("searchRanking", context: context)     // .variant("semantic")
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                               |
| -------- | ------------------------------------------------- |
| Skill    | `@examples/skills/swift-tinyflags-add-flag`       |
| Skill    | `@examples/skills/swift-tinyflags-rollout-review` |
| Skill    | `@examples/skills/swift-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/swift-tinyflags-maintainer`  |
| Pack     | `@examples/packs/swift-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:swift/example.com/agentxm/example-tinyflags-swift@^0.1.0` as its
companion package.

## Scenario

A SwiftPM package author can use this layout as a model:

1. Implement the normal Swift package.
2. Ship an `axm.json` sidecar at the package root recommending the companion
   pack. SwiftPM will place it at `.build/checkouts/<package-name>/axm.json`
   in every consumer.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
