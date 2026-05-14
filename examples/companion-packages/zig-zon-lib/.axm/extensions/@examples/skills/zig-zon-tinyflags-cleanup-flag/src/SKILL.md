---
name: zig-zon-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Zig call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Zig package.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `registry.enabled(...)`, `registry.variant(...)`, and
   `registry.evaluate(...)` call sites with the final behavior. Drop any
   unused `_ = registry;` binding so the compiler stays quiet.
3. Delete the flag entry from the `Registry.init(allocator, &.{...})` slice.
4. Remove the `FLAG_*` constant and any associated imports.
5. Delete `test "..."` blocks that only exercise obsolete rollout branching.
6. Add or update tests for the final simplified behavior.
7. Search for the flag key across `*.zig` files, README files, and doc
   comments.

## Guardrails

- Do not leave a deleted flag referenced in a string literal — the compiler
  will not catch it.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve the package's public API unless release notes call out a breaking
  change.
- After cleanup, run `zig build` and `zig build test` to confirm no
  references remain and no tests are dead.
