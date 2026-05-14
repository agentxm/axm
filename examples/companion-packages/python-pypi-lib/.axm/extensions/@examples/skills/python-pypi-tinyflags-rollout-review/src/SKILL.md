---
name: python-pypi-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Python rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a PyPI Python package.

## Review Checklist

- Every flag has an explicit `default`.
- Boolean rollouts use `int` values from 0 to 100 (not `bool`, not `float`).
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout mappings.
- Evaluation contexts include a stable `user_id`, `account_id`, or
  `session_id`.
- Tests use `pytest` (or the package's existing test runner) and exercise both
  default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per request.

## Python Details

Check imports from `agentxm_example_tinyflags`. Prefer the public dataclass and
class names:

```python
from agentxm_example_tinyflags import BooleanFlag, TinyFlags, VariantFlag
```

Pass evaluation context as a `FlagContext` mapping or plain `dict[str, str]`.
Avoid building contexts ad hoc at every call site; thread a single context
object through the request boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled path can be deleted or explain why the flag remains
temporary.
