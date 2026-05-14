---
name: dotnet-fsharp-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe F# rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a .NET F# package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `UserId`, `AccountId`, or `SessionId`.
- Tests cover both default behavior and rollout boundaries.
- No code path assumes rollout bucketing is random per request.

## F# Details

Check opens from `AgentXM.Examples.TinyFlags.FSharp` and keep flag definitions
data-first:

```fsharp
TinyFlags.create [
    "checkoutRedesign",
    Flag.Boolean(defaultValue = false, rollout = 10)
]
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
