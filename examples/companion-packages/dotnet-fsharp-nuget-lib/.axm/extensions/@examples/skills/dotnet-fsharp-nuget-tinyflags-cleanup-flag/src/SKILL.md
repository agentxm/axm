---
name: dotnet-fsharp-nuget-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify F# call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and should
be removed from a .NET F# project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `TinyFlags.enabled`, `TinyFlags.variant`, and `TinyFlags.evaluate`
   call sites with the final behavior.
3. Delete the flag definition from the `TinyFlags.create` list.
4. Remove tests that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag key in source, tests, README files, and examples.

## Guardrails

- Do not leave a deleted flag referenced in a string literal.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless release notes call out a breaking
  change.
- Keep F# source order and project file compile order intact.
