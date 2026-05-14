---
name: julia-general-tinyflags-add-flag
description: Add a TinyFlags flag to a Julia project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Julia project that depends on
`AgentXMExampleTinyFlags`.

## Workflow

1. Find the Julia module that constructs the `Registry` from its definitions
   `Dict` (typically `src/<Module>/flags.jl` or similar).
2. Add the flag as a `BooleanFlag(...)` or `VariantFlag(...)` entry.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update `Test` coverage in `test/` for default behavior and rollout
   behavior. Run via `julia --project -e 'using Pkg; Pkg.test()'`.
5. Update the package README when the flag is user-facing.

## Boolean Flags

Use `BooleanFlag(default=false)` for a disabled-by-default feature.

Use `BooleanFlag(default=false, rollout=10)` for a percentage rollout.
Rollout bucketing is deterministic by `user_id`, `account_id`, or
`session_id` on the evaluation `Context`.

## Variant Flags

Use `VariantFlag(variants=["classic", "semantic"], default="classic")` when
the call site needs a named treatment instead of `true`/`false`.

Use `rollout=` to allocate traffic:

```julia
VariantFlag(
    variants=["classic", "semantic"],
    default="classic",
    rollout=Dict("semantic" => 10),
)
```

## Done Criteria

- New flag has an explicit `default=` keyword argument.
- Rollout percentage is an `Integer` from 0 to 100 (not `Float`, not `Bool`).
- Variant rollouts reference only declared variants.
- `Test` cases cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
