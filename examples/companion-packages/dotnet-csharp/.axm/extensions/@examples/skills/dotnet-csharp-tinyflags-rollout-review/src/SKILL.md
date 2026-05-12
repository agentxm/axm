---
name: dotnet-csharp-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe C# rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a .NET C# package.

## Review Checklist

- Every flag has an explicit default.
- Boolean rollouts use integers from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout maps.
- Evaluation contexts include a stable `UserId`, `AccountId`, or `SessionId`.
- Tests cover both default behavior and rollout boundaries.
- No code path assumes rollout bucketing is random per request.

## C# Details

Check imports from `AgentXM.Example.TinyFlags.CSharp` and keep nullable
annotations enabled. Prefer explicit dictionaries at flag-definition boundaries:

```csharp
TinyFlags.Create(new Dictionary<string, FlagDefinition>
{
    ["checkoutRedesign"] = TinyFlag.Boolean(defaultValue: false, rollout: 10),
});
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
