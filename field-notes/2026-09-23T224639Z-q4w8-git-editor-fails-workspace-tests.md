---
observed_at: "2026-09-23T22:46:39Z"
session: "q4w8"
area: "workspace test target in an agent shell"
---

# Inherited GIT_EDITOR failed Git-backed workspace tests again

## Context

Ran the full `pnpm exec nx run workspace:test` target in a worktree to check a
failure-rendering change. The agent shell exports `GIT_EDITOR=true`.

## Friction

33 tests in 12 files failed, almost all Git-backed, alongside the change's own
results. Separating the environment failures from real regressions required a
second run of the failed files.

## Cost / impact

One extra targeted test run over 12 files. The full run's summary could not be
read as a verdict on the change.

## Outcome

Rerunning the 12 failed files with `env -u GIT_EDITOR` passed 65 of 66 tests;
the remaining failure was a real regression in the change and was fixed.

## Evidence

The first run reported 12 failed and 540 passed files (33 failed, 4381 passed
tests), with 51 log lines mentioning `GIT_EDITOR`.

## Existing context

The same occurrence was recorded earlier in
`field-notes/2026-09-23T181802Z-r5t9-git-editor-blocks-simple-git-tests.md`.
