---
name: r-cran-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify R call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from an R package.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `tf_enabled(...)`, `tf_variant_value(...)`, and
   `tf_evaluate(...)` call sites with the final behavior.
3. Delete the flag entry from the `tf_registry(...)` call.
4. Remove `testthat` cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (string form, kebab-case and any constant
   alias) in `R/`, `tests/`, vignettes, `README.md`, and `NEWS.md`.

## Guardrails

- Do not leave a deleted flag referenced in a string literal anywhere in
  the package.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public API compatibility unless the `NEWS.md` release notes
  explicitly call out a breaking change.
- Keep R style consistent with the package: tidyverse style, base R
  style, or whatever the package's `lintr`/`styler` config enforces.
- After removing exports, regenerate `NAMESPACE` (e.g.
  `devtools::document()` if the package uses roxygen2).
