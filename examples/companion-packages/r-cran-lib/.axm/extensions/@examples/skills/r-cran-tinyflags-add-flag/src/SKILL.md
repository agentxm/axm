---
name: r-cran-tinyflags-add-flag
description: Add a TinyFlags flag to an R package project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to an R project that uses
`tinyflags`.

## Workflow

1. Find the R file that builds the `tf_registry(...)` (typically
   `R/flags.R` or `R/feature_flags.R`).
2. Add the flag as a `tf_bool(...)` or `tf_variant(...)` entry inside
   `tf_registry(...)`.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update `testthat` coverage under `tests/testthat/` for default
   behavior and rollout behavior. Run via
   `Rscript -e 'testthat::test_local()'` or `R CMD check`.
5. Update `README.md`, vignettes, or `NEWS.md` when the flag is
   user-facing.

## Boolean Flags

Use `tf_bool(default = FALSE)` for a disabled-by-default feature.

Use `tf_bool(default = FALSE, rollout = 10L)` for a percentage rollout.
Rollout bucketing is deterministic by `user_id`, `account_id`, or
`session_id` from the evaluation context (built with `tf_with_context()`).

## Variant Flags

Use `tf_variant(variants = c("classic", "semantic"), default = "classic")`
when the call site needs a named treatment instead of `TRUE`/`FALSE`.

Use `rollout` to allocate traffic:

```r
tf_variant(
  variants = c("classic", "semantic"),
  default = "classic",
  rollout = c(semantic = 10)
)
```

## Done Criteria

- New flag has an explicit `default =` argument.
- Rollout percentage is an integer-valued numeric from 0 to 100 (not
  `TRUE`/`FALSE`, not a fraction like `0.1`).
- Variant rollouts reference only declared variants and sum to <= 100.
- `testthat` tests cover default behavior and at least one rollout
  boundary.
- Dead conditional branches are not introduced.
- `NAMESPACE` does not need editing — flag names live in code, not exports.
