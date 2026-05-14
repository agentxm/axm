---
name: golang-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Go call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Go module.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `flags.Enabled(...)`, `flags.Variant(...)`, and
   `flags.Evaluate(...)` call sites with the final behavior. Make sure
   unused locals like `_ = flags` are removed so `go vet` and the compiler
   stay quiet.
3. Delete the flag entry from the `tinyflags.New` / `tinyflags.MustNew`
   definitions map.
4. Remove the `Flag<Name>` string constant and any associated imports.
5. Delete tests that only exercise obsolete rollout branching.
6. Add or update tests for the final simplified behavior.
7. Search for the flag key across `*.go`, `*_test.go`, README files, and
   doc comments.

## Guardrails

- Do not leave a deleted flag referenced in a string literal — the compiler
  will not catch it.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve the module's exported API unless release notes call out a
  breaking change.
- After cleanup, run `go vet ./...` and `go test ./...` to confirm no
  references remain and no tests are dead.
