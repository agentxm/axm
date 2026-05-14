# PawMatch (Swift consumer app)

`pawmatch` is a tiny Swift Package Manager CLI for a fictional community pet
adoption center. It is a reference _consumer_ of the
`AgentXMExampleTinyFlags` library — exactly the codebase the companion AXM
skills and subagent in `../swift-lib/.axm/extensions/` are designed to
operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`swift-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/swift-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
swift run pawmatch browse
swift run pawmatch show pepper
swift run pawmatch match --has-kids --active
swift run pawmatch apply biscuit
swift run pawmatch fees
swift run pawmatch return-support
swift run pawmatch donate
swift run pawmatch donate brother-wolf --open
```

Build a standalone binary with:

```bash
swift build -c release
./.build/release/pawmatch browse
```

## Test

```bash
swift test
```

The XCTest suite under `Tests/PawMatchTests/` exercises every subcommand
path on `PawMatchRunner` using a buffered `BufferOutput` and a stub URL
opener so no subprocess or browser is launched. (XCTest was chosen for
portability across the command-line Swift toolchain and Xcode; Swift Testing
is an idiomatic alternative on toolchains that bundle it.)

## Library dependency

The library `AgentXMExampleTinyFlags` has not yet been published to a Swift
package index, so the app references the sibling library directly via a
relative-path `package(path:)` dependency in `Package.swift`:

```swift
.package(path: "../swift-lib")
```

A real consumer would write a URL-based dependency, which is how SwiftPM
identifies packages — the AXM Swift detector parses
`.package(url: "...")` lines to compute the purl:

```swift
.package(url: "https://example.com/agentxm/example-tinyflags-swift.git", from: "0.1.0")
```

We use the placeholder host `example.com/agentxm/example-tinyflags-swift`
across the example so the docs do not imply a real GitHub repository. See
`../swift-lib/README.md` for the rationale.

TODO: once the library is published and indexed, switch to the URL-based
dependency form.

## Flag seams

Flag definitions live in `Sources/PawMatchKit/Flags.swift`. Each is wired into
at least one command so the companion skills have realistic targets:

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

Rollouts are deterministic per user (the CLI derives the session id from
`USER` / `USERNAME` / `LOGNAME` environment variables), so running the same
command twice produces the same flag values.

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
independently before giving. See `Sources/PawMatchKit/Charities.swift`.
