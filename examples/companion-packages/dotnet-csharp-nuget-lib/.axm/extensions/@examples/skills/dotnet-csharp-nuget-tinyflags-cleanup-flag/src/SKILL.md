---
name: dotnet-csharp-nuget-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify C# call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and should
be removed from a .NET C# project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.Enabled(...)`, `flags.Variant(...)`, and `flags.Evaluate(...)`
   call sites with the final behavior.
3. Delete the flag definition from the `TinyFlags.Create` table.
4. Remove tests that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag key in source, tests, README files, and examples.

## Guardrails

- Do not leave a deleted flag referenced in a string literal.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless release notes call out a breaking
  change.
- Keep C# nullable annotations and project style intact.
