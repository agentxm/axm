---
name: julia-general-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Julia rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Julia package.

## Review Checklist

- Every flag has an explicit `default=` keyword argument.
- Boolean rollouts use `Integer` values from 0 to 100 (not `Float`, not
  `Bool`).
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout `Dict`s.
- Evaluation contexts use `Context(; user_id=...)` with a stable identifier
  rather than ad-hoc strings.
- `Test` cases exercise both default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per request.

## Julia Details

Check `using AgentXMExampleTinyFlags` (or the package's own re-export) at the
top of files that construct flag definitions:

```julia
using AgentXMExampleTinyFlags

const FLAGS = Registry(Dict(
    "checkout_redesign" => BooleanFlag(default=false, rollout=10),
))
```

Pass evaluation context as a `Context` value with stable identifiers
(`Context(user_id=current_user.id)`). Avoid constructing contexts ad hoc at
every call site; thread a single context through the request boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
