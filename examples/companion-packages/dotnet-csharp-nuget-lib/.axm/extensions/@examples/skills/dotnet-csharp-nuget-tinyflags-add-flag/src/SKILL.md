---
name: dotnet-csharp-nuget-tinyflags-add-flag
description: Add a TinyFlags flag to a .NET C# project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a .NET C# project that uses
`AgentXM.Examples.TinyFlags.CSharp`.

## Workflow

1. Find the module that creates the `TinyFlags` client.
2. Add the flag with `TinyFlag.Boolean` or `TinyFlag.Variant`.
3. Prefer PascalCase for public C# members and camelCase for local variables.
4. Add or update test coverage for default behavior and rollout behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use `TinyFlag.Boolean(defaultValue: false)` for a disabled-by-default feature.

Use `TinyFlag.Boolean(defaultValue: false, rollout: 10)` for a percentage
rollout. The rollout is deterministic by `UserId`, `AccountId`, or `SessionId`.

## Variant Flags

Use a variant flag when the call site needs a named treatment:

```csharp
TinyFlag.Variant(
    new[] { "classic", "semantic" },
    defaultValue: "classic",
    rollout: new Dictionary<string, int> { ["semantic"] = 10 });
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
