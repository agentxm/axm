---
name: haskell-hackage-tinyflags-add-flag
description: Add a TinyFlags flag to a Haskell project with implementation, Hspec tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to a Haskell project that uses
`agentxm-example-tinyflags`.

## Workflow

1. Find the Haskell module that builds the `Registry` (typically a module
   exporting a `flags :: Registry` or `buildRegistry :: Registry`).
2. Add the flag via `booleanFlag` or `variantFlag`. Both return
   `Either TinyFlagsError`; bind the result in `do` notation or pattern-
   match it where the registry is constructed.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update Hspec coverage in `test/` for default behavior and
   rollout behavior. Run via `cabal test`.
5. Update README or local package docs when the flag is user-facing.

## Boolean Flags

Use `booleanFlag False Nothing` for a disabled-by-default feature.

Use `booleanFlag False (Just 10)` for a 10% rollout. Rollout bucketing is
deterministic by `ctxUserId`, `ctxAccountId`, or `ctxSessionId` from the
evaluation `Context`.

## Variant Flags

Use `variantFlag ["classic", "semantic"] "classic" Nothing` when the call
site needs a named treatment instead of `True`/`False`.

Use `Just [...]` to allocate traffic. The allocation list is order-
significant — entries are walked top to bottom:

```haskell
variantFlag
  ["classic", "semantic"]
  "classic"
  (Just [("semantic", 10)])
```

## Done Criteria

- New flag constructs through `booleanFlag` or `variantFlag` and the
  `Either TinyFlagsError` result is handled (not pattern-matched with a
  partial `Right`).
- Rollout percentages are `Int` values from 0 to 100.
- Variant rollouts reference only declared variants and total ≤ 100.
- Hspec specs cover default behavior and at least one rollout boundary.
- No dead conditional branches are introduced.
