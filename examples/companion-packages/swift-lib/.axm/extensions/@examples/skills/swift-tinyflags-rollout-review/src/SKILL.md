---
name: swift-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Swift rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Swift package.

## Review Checklist

- Every flag is constructed with an explicit `default:` — do not rely on a
  Swift caller passing a sentinel.
- Boolean rollouts use integers from 0 to 100 via the `rollout:` argument.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in variant `rollout:` dictionaries.
- Every call site supplies a stable `EvaluationContext` — never the empty
  initializer from a request-scoped task.
- Tests use Swift Testing (`import Testing`, `@Test`, `#expect`) and live
  alongside the module they exercise.
- No code path assumes rollout bucketing is random per request — bucketing is
  deterministic for a given (flag-name, context.identifier) pair.

## Swift Details

Use the typed builder rather than constructing definitions ad-hoc:

```swift
let flags = try TinyFlags.builder()
    .boolean("checkoutRedesign", default: true)
    .build()
```

Propagate the `throws` from builder methods through to whichever entry point
fails the process at start — invalid flag definitions are a programmer error
that should crash early, not at the first evaluation.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or explain why the flag
remains temporary.
