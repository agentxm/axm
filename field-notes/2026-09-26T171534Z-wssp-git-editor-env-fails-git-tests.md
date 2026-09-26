---
observed_at: "2026-09-26T17:15:34Z"
session: "wssp"
area: "workspace test verification"
---

# Inherited GIT_EDITOR failed every Git-backed workspace test

## Context

The agent session ran `pnpm exec nx run workspace:test` to verify an import-only refactor of `packages/core/workspace`.

## Friction

The session environment exported `GIT_EDITOR`. `simple-git` refused each Git call with `Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor`, so 13 test files failed (Git source resolution, locator selection, source switches, sharing, sync) although the change did not touch Git code.

## Cost / impact

One full workspace test run was spent on environment failures and had to be repeated.

## Outcome

Rerunning the target with `GIT_EDITOR` unset passed all 555 test files.

## Evidence

`GitOperationFailed` with operation `get-tree-sha` from `src/resolution/sources/git/operations.test.ts`, cause `Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor` from `simple-git` 3.36.0.
