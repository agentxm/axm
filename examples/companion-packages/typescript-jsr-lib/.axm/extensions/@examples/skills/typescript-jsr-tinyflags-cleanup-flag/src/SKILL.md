---
name: typescript-jsr-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify TypeScript call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a JSR (Deno) TypeScript project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.enabled(...)`, `flags.variant(...)`, and `flags.evaluate(...)`
   call sites with the final behavior.
3. Delete the flag definition from the `tinyFlags` table.
4. Remove tests that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag key in source, tests, README files, and examples.

## Guardrails

- Do not leave a deleted flag referenced in a string literal.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless the package release notes
  explicitly call out a breaking change.
- Keep TypeScript module syntax consistent with the package. JSR projects
  use ES module syntax and explicit `.ts` extensions.
