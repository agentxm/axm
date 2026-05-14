---
name: hex-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Elixir call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from an Elixir project.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `TinyFlags.enabled/3`, `TinyFlags.variant/3`, and
   `TinyFlags.evaluate/3` call sites with the final behavior. Make sure
   unused `flags` bindings and unused aliases are removed.
3. Delete the flag entry from the `TinyFlags.new!/1` definitions map.
4. Remove any `@flag_<name>` module attributes, helpers, or imports that
   only existed to read the flag.
5. Delete tests that only exercise obsolete rollout branching.
6. Add or update tests for the final simplified behavior.
7. Search the project for the flag key across `lib/**/*.ex`,
   `test/**/*.exs`, README files, and doc strings.

## Guardrails

- Do not leave a deleted flag referenced in a string literal — the compiler
  will not catch it.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve the module's public API unless release notes call out a breaking
  change.
- After cleanup, run `mix format`, `mix compile --warnings-as-errors`, and
  `mix test` to confirm no references remain and no tests are dead.
