---
name: go-gomod-tinyflags-add-flag
description: Add a TinyFlags flag to a Go project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Go module that imports
`github.com/agentxm/example-tinyflags/tinyflags`.

## Workflow

1. Find the file that builds the `*tinyflags.Flags` set with `tinyflags.New`
   or `tinyflags.MustNew`. The example app keeps this in `internal/pawmatch/flags.go`.
2. Add the flag as a `tinyflags.MustBooleanFlag(...)` or
   `tinyflags.MustVariantFlag(...)` entry in the definitions map.
3. Prefer kebab-case keys for flag names (`home-check-followup`), and add a
   matching `Flag<Name>` string constant in the same file so call sites use
   the constant rather than a string literal.
4. Add or update a `*_test.go` file that uses Go's standard-library `testing`
   package to cover default behavior and at least one rollout boundary.
5. Update the package README or `cmd/pawmatch/...` help text when the flag is
   user-facing.

## Boolean Flags

Use `tinyflags.MustBooleanFlag(tinyflags.BoolDefault(false))` for a
disabled-by-default feature.

Use `tinyflags.MustBooleanFlag(tinyflags.BoolDefault(false),
tinyflags.BoolRollout(10))` for a percentage rollout. The rollout is
deterministic by `tinyflags.Context{ID: ...}`.

## Variant Flags

Use `tinyflags.MustVariantFlag([]string{"classic", "semantic"},
tinyflags.VariantDefault("classic"))` when the call site needs a named
treatment instead of true or false.

Use `tinyflags.VariantRollout` to allocate traffic:

```go
tinyflags.MustVariantFlag(
    []string{"classic", "semantic"},
    tinyflags.VariantDefault("classic"),
    tinyflags.VariantRollout(map[string]int{"semantic": 10}),
)
```

## Done Criteria

- New flag has an explicit default (via `BoolDefault` or `VariantDefault`).
- Rollout percentage is an integer from 0 to 100.
- Variant rollouts reference only declared variants.
- Tests cover default behavior and at least one rollout boundary.
- Call sites read the flag through a `Flag<Name>` constant, not a string
  literal.
- `go vet ./...` and `go test ./...` both pass.
