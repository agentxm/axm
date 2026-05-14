---
name: cocoapods-tinyflags-add-flag
description: Add a TinyFlags flag to a CocoaPods Swift project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a CocoaPods Swift project that
depends on the `AgentXMExampleTinyFlags` pod.

## Workflow

1. Find the module that builds the `TinyFlags` instance (usually a static
   factory or shared singleton).
2. Add the flag with `Flag.boolean(default:rollout:)` or
   `Flag.variant(_:default:rollout:)`.
3. Prefer Swift naming: lowerCamelCase for properties, lowercase-dashed for
   the flag key.
4. Add or update XCTest coverage for default behavior and at least one
   rollout boundary.
5. Update the pod's README when the flag is user-facing.

## Boolean Flags

Use `Flag.boolean(default: false)` for a disabled-by-default feature.

Use `Flag.boolean(default: false, rollout: 10)` for a percentage rollout. The
rollout is deterministic by the caller's `EvaluationContext.identifier` (or
`EvaluationContext.session(_:)`).

## Variant Flags

Use a variant flag when the call site needs a named treatment:

```swift
try Flag.variant(
    ["classic", "semantic"],
    default: "classic",
    rollout: ["semantic": 10]
)
```

## CocoaPods Specifics

- The library is imported with `import AgentXMExampleTinyFlags`.
- The pod is consumed from `Pods/AgentXMExampleTinyFlags/` after `pod install`.
- Tests in the pod run via `pod lib lint`'s `s.test_spec`; consumer-side tests
  run in the host project's test target.

## Done Criteria

- New flag has an explicit default value.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- No dead conditional branches are left in place.
