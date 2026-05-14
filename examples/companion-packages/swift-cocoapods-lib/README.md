# CocoaPods TinyFlags

This example shows how a CocoaPods package can ship companion AXM extensions
for its users. The package is a small Swift feature flag library named
`AgentXMExampleTinyFlags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The pod is
published with the `AgentXMExample` prefix on CocoaPods Trunk.

The pod ships AXM recommendations in an `axm.json` sidecar shipped at the pod
root:

```json
{
  "recommendedExtensions": ["@examples/packs/swift-cocoapods-tinyflags@^0.1.0"]
}
```

When a consumer runs `pod install`, CocoaPods copies the pod sources into
`Pods/AgentXMExampleTinyFlags/`. AXM discovery reads
`Pods/AgentXMExampleTinyFlags/axm.json` and surfaces the companion pack as a
package-author recommendation.

A working consumer is in `../swift-cocoapods-app/` (the `pawmatch` CLI).

## How the `axm.json` sidecar survives `pod install`

CocoaPods only copies files referenced in the podspec into the installed pod
tree. The `axm.json` sidecar is listed in `s.preserve_paths`:

```ruby
s.preserve_paths = "axm.json"
```

`preserve_paths` keeps the file in `Pods/AgentXMExampleTinyFlags/axm.json`
without trying to compile it. Equivalent options are `s.source_files` (would
try to compile non-Swift files) or `s.resources` (would copy into the framework
bundle). `preserve_paths` is the cleanest fit for an AXM sidecar.

The pod name (`AgentXMExampleTinyFlags`) maps directly to the on-disk
directory CocoaPods installs into (`Pods/AgentXMExampleTinyFlags/`), so the
detector at `packages/core/src/unstable/packaging/cocoapods.ts` resolves the
sidecar without configuration.

## Layout

```text
.
├── AgentXMExampleTinyFlags.podspec   CocoaPods manifest
├── Sources/AgentXMExampleTinyFlags/  Library sources
├── Tests/AgentXMExampleTinyFlagsTests/  XCTest tests via `s.test_spec`
├── axm.json                          Companion-extension recommendations (preserve_paths)
└── .axm/extensions/@examples/        Authored AXM extension sources
```

## Build & test

```bash
pod lib lint --allow-warnings   # lint the podspec and run the test spec locally
```

`pod lib lint` runs the XCTest suite declared by `s.test_spec "Tests"` against
a generated host project. The pod is consumed by the sibling
`../swift-cocoapods-app/` via `:path =>` so no Trunk push is required for the example
to be reproducible.

## Library

The library lives in `Sources/AgentXMExampleTinyFlags/TinyFlags.swift` and
exposes:

- `Flag.boolean(default:rollout:)` — smart constructor
- `Flag.variant(_:default:rollout:)` — smart constructor
- `TinyFlags.builder().boolean(...).variant(...).build()`
- `EvaluationContext.session(_:)` / `EvaluationContext(identifier:)`
- `FlagValue` — typed result (`.bool(Bool)` / `.variant(String)`)

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
try flags.enabled("checkoutRedesign", context: context)  // true
try flags.variant("searchRanking", context: context)     // "semantic"
try flags.evaluate("searchRanking", context: context)    // .variant("semantic")
```

Tests are XCTest (the supported framework for `pod lib lint`'s test spec).

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                         |
| -------- | ----------------------------------------------------------- |
| Skill    | `@examples/skills/swift-cocoapods-tinyflags-add-flag`       |
| Skill    | `@examples/skills/swift-cocoapods-tinyflags-rollout-review` |
| Skill    | `@examples/skills/swift-cocoapods-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/swift-cocoapods-tinyflags-maintainer`  |
| Pack     | `@examples/packs/swift-cocoapods-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:cocoapods/AgentXMExampleTinyFlags@^0.1.0` as its companion
package.

## Scenario

A CocoaPods package author can use this layout as a model:

1. Implement the normal pod with a `.podspec`.
2. Place `axm.json` at the pod root and add it to `s.preserve_paths` (or
   `s.source_files` / `s.resources`) so it survives `pod install`.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the pod to Trunk and the extensions independently or as a companion
   pack.

## Relationship to the SwiftPM example

The `swift-spm-lib/` example demonstrates the same idea for Swift Package Manager
(`Package.swift`, sources resolved into the SwiftPM cache). This example uses
the same library shape but ships through CocoaPods (`.podspec`, sources
resolved into `Pods/`). The AXM detectors handle each manifest format
independently.
