---
name: python-pypi-tinyflags-add-flag
description: Add a TinyFlags flag to a PyPI Python project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Python project that uses
`agentxm-example-tinyflags`.

## Workflow

1. Find the module that constructs the `TinyFlags` instance from its
   definition mapping.
2. Add the flag as a `BooleanFlag` or `VariantFlag` entry.
3. Prefer `snake_case` flag keys.
4. Add or update `pytest` coverage for default behavior and rollout behavior.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use `BooleanFlag(default=False)` for a disabled-by-default feature.

Use `BooleanFlag(default=False, rollout=10)` for a percentage rollout. The
rollout is deterministic by `user_id`, `account_id`, or `session_id` from the
`FlagContext`.

## Variant Flags

Use `VariantFlag(variants=("classic", "semantic"), default="classic")` when the
call site needs a named treatment instead of `True` or `False`. Variants are
declared as a tuple so the flag is hashable and frozen.

Use `rollout` to allocate traffic:

```python
VariantFlag(
    variants=("classic", "semantic"),
    default="classic",
    rollout={"semantic": 10},
)
```

## Done Criteria

- New flag has an explicit `default`.
- Rollout percentage is an `int` from 0 to 100 (not `bool`, not `float`).
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Dead conditional branches are not introduced.
