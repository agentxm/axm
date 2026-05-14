---
name: golang-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe Go rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a Go module.

## Review Checklist

- Every flag is constructed with an explicit `tinyflags.BoolDefault(...)` or
  `tinyflags.VariantDefault(...)` — do not rely on the zero value.
- Boolean rollouts use integers from 0 to 100 via `tinyflags.BoolRollout(...)`.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in `tinyflags.VariantRollout` maps.
- Every call site supplies a stable `tinyflags.Context{ID: ...}` — never a
  blank `Context{}` from a request-scoped goroutine.
- Tests use the standard-library `testing` package and live next to the
  package they exercise.
- No code path assumes rollout bucketing is random per request — bucketing is
  deterministic for a given `(flag name, Context.ID)` pair.

## Go Details

Check that the import path is correct and use the named package, not a dot
import:

```go
import "github.com/agentxm/example-tinyflags/tinyflags"

flags := tinyflags.MustNew(map[string]tinyflags.Flag{
    "checkoutRedesign": tinyflags.MustBooleanFlag(tinyflags.BoolDefault(true)),
})
```

Prefer `MustBooleanFlag` / `MustVariantFlag` / `MustNew` for package-level
flag tables — invalid definitions are programmer errors caught at process
start. Use the error-returning constructors when flag input is loaded from
configuration at runtime.

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or explain why the flag
remains temporary.
