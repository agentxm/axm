---
name: cocoapods-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Swift rollouts in a CocoaPods project.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a CocoaPods Swift package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `identifier` (or
  `EvaluationContext.session(_:)`).
- XCTest cases cover both default behavior and rollout boundaries.
- No code path assumes rollout bucketing is random per request.

## CocoaPods / Swift Details

Check imports of `AgentXMExampleTinyFlags` and prefer the builder style at
flag-definition boundaries:

```swift
let flags = try TinyFlags.builder()
    .boolean("checkoutRedesign", default: false, rollout: 10)
    .variant(
        "searchRanking",
        variants: ["classic", "semantic"],
        default: "classic",
        rollout: ["semantic": 10]
    )
    .build()
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.

If the project locks the pod version in its `Podfile`, prefer pinning to the
same minor (`pod 'AgentXMExampleTinyFlags', '~> 0.1'`) so library upgrades stay
reviewable alongside the rollout.
