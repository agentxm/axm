---
name: r-cran-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe R rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in an R package.

## Review Checklist

- Every flag has an explicit `default =` argument.
- Boolean rollouts use integer-valued numeric from 0 to 100 (not `TRUE` or
  `FALSE`, not a fraction like `0.1`).
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout vectors.
- Evaluation contexts include a stable `user_id`, `account_id`, or
  `session_id` (use `tf_with_context()` rather than ad-hoc lists).
- `testthat` specs exercise both default and rollout-allocated paths.
- No code path assumes bucketing is random per call — it is deterministic
  per context.

## R Details

Check `library(tinyflags)` or `tinyflags::` qualified calls at the top of
files that build flag definitions:

```r
library(tinyflags)

flags <- tf_registry(
  "checkout-redesign" = tf_bool(default = FALSE, rollout = 10L)
)
```

Pass evaluation context as a `tf_context` (built with `tf_with_context()`)
rather than constructing lists at every call site. Thread a single context
through a request, function, or pipeline boundary.

Rollout changes should be small and reviewable. If a rollout moves from 0
to 100, confirm the disabled path can be deleted or explain why the flag
remains temporary.
