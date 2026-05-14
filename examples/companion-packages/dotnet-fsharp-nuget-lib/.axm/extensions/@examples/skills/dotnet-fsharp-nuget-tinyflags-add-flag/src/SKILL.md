---
name: dotnet-fsharp-nuget-tinyflags-add-flag
description: Add a TinyFlags flag to a .NET F# project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a .NET F# project that uses
`AgentXM.Examples.TinyFlags.FSharp`.

## Workflow

1. Find the module or value that creates the `TinyFlags` instance.
2. Add the flag with `Flag.Boolean` or `Flag.Variant`.
3. Prefer camelCase for local F# values and PascalCase for public types.
4. Add or update test coverage for default behavior and rollout behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use a disabled-by-default boolean flag:

```fsharp
Flag.Boolean(defaultValue = false)
```

Use `rollout = 10` for a percentage rollout. The rollout is deterministic
by `UserId`, `AccountId`, or `SessionId`.

## Variant Flags

Use a variant flag when the call site needs a named treatment:

```fsharp
Flag.Variant(
    variants = [ "classic"; "semantic" ],
    defaultValue = "classic",
    rollout = Map.ofList [ "semantic", 10 ]
)
```

## Done Criteria

- New flag has an explicit default.
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
