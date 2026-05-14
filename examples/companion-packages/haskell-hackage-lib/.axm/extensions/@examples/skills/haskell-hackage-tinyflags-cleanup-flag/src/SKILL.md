---
name: haskell-hackage-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify Haskell call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from a Haskell package.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `enabled reg "..."` and `variant reg "..."` (and `evaluate`)
   call sites with the final behavior.
3. Delete the flag entry from the `registry [...]` literal.
4. Remove Hspec cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (string literal form) under `src/`, `app/`,
   `test/`, the README, and the `.cabal` file.

## Guardrails

- Do not leave a deleted flag referenced in a string literal anywhere in
  the package.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve public module API compatibility unless a major version bump is
  intended; record breaking changes in the `.cabal` `description` and
  release notes.
- Keep Haskell style consistent with the package: existing pragmas
  (`OverloadedStrings`, `LambdaCase`, etc.), formatter (`ormolu` or
  `fourmolu`), and import grouping should remain unchanged on edited
  files.
