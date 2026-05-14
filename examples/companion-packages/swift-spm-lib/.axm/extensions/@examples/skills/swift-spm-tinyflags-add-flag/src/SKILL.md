---
name: swift-spm-tinyflags-add-flag
description: Add a TinyFlags flag to a Swift project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Swift package that depends on
`AgentXMExampleTinyFlags`.

## Workflow

1. Find the file that builds the `TinyFlags` bundle via `TinyFlags.builder()`
   (or `TinyFlags(definitions:)`). In the example app it is
   `Sources/PawMatch/Flags.swift`.
2. Add the flag with `builder.boolean(...)` or `builder.variant(...)`. Both
   throw on invalid input — propagate the `throws` rather than `try!`-ing in
   library code.
3. Prefer kebab-case keys for flag names (`home-check-followup`) and add a
   matching `static let` flag-name constant in the same file so call sites use
   the constant rather than a string literal.
4. Add a Swift Testing case (`@Test func ...`) that covers default behavior
   and at least one rollout boundary. Place it in
   `Tests/<Module>Tests/`.
5. Update the package README or CLI help text when the flag is user-facing.

## Boolean Flags

```swift
try builder.boolean("home-check-followup", default: false)
```

For a percentage rollout:

```swift
try builder.boolean("home-check-followup", default: false, rollout: 25)
```

The rollout is deterministic by `EvaluationContext.identifier`.

## Variant Flags

```swift
try builder.variant(
    "pet-card-style",
    variants: ["compact", "detailed", "playful"],
    default: "detailed"
)
```

Use the `rollout:` argument to allocate traffic:

```swift
try builder.variant(
    "recommendation-strategy",
    variants: ["popularity", "match-quiz", "longest-stay"],
    default: "match-quiz",
    rollout: ["longest-stay": 20]
)
```

## Done Criteria

- New flag has an explicit `default:` (Swift will not infer one).
- Rollout percentage is an `Int` in `0...100`.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Call sites read the flag through a `static let` constant, not a string
  literal.
- `swift build` and `swift test` both pass.
