---
observed_at: "2026-09-23T21:47:16Z"
session: "22b4b8fc-e165-43e7-a0db-d13418226ba7"
area: "pnpm run verify:pr in an agent shell"
---

# Inherited GIT_EDITOR fails Git-backed workspace tests during verify:pr

## Context

Running `pnpm run verify:pr` in an isolated worktree before landing a
specification-only change to scoped aggregate-region sync.

## Friction

`workspace:test` failed about 25 Git-backed tests (Git operations, Git
restoration, source switches, Git discovery). Each failure reported
`Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor`. The
agent shell exports `GIT_EDITOR`. None of the failures involved the changed
files.

## Cost / impact

One full `verify:pr` run (2m 10s, exit 130) plus diagnosis of the log before
rerunning.

## Outcome

Reran `verify:pr` with `GIT_EDITOR` unset.

## Evidence

- `workspace:test` failures, for example
  `src/resolution/sources/git/operations.test.ts > getTreeSha` and
  `src/reconciliation/sync/preserves-configuration-and-resolutions.spec.ts`
- `env` in the agent shell lists `GIT_EDITOR`

## Existing context

An earlier note from the same day,
`2026-09-23T181802Z-r5t9-git-editor-blocks-simple-git-tests.md`, records the
same occurrence shape.
