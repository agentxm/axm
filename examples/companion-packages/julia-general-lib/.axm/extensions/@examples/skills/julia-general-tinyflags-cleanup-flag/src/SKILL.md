---
name: julia-general-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Julia call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Julia package.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `tf_bool(...)`, `tf_variant(...)`, and `tf_evaluate(...)` call
   sites with the final behavior.
3. Delete the flag entry from the `Registry(Dict(...))` definitions.
4. Remove `Test` cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (string form, including any `Symbol` aliases) in
   `src/`, `test/`, README files, and `Project.toml`.

## Guardrails

- Do not leave a deleted flag referenced in a string literal or `Symbol`.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless the package release notes
  explicitly call out a breaking change. Bump `version` in `Project.toml`
  accordingly.
- Keep Julia style consistent with the package — module layout, docstring
  conventions, and import order.
