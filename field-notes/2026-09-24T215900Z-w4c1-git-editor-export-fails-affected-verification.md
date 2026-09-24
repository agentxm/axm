---
observed_at: "2026-09-24T21:53:00Z"
session: "w4c1"
area: "environment: agent shell exports GIT_EDITOR during pnpm run verify:affected"
---

# Agent shell's GIT_EDITOR export fails the workspace Git tests under verify:affected

## Context

Final verification of a CLI architecture-conformance change (exit codes,
defects, redaction, recovery lists, telemetry) in the `axm` worktree, with
`pnpm run verify:affected` as the required gate.

## Friction

`workspace:test` failed in 17 files, all Git-source tests (git operations,
locator selection, source switches, share-workspace, discovery), each with
`Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor`. The
agent shell exports `GIT_EDITOR=true`. None of the failures touched the changed
code.

## Cost / impact

One full verification run (2m 53s) discarded, plus reading the log to separate
the environment failures from the change; the second run under
`env -u GIT_EDITOR` passed (2m 32s).

## Outcome

Rerun with `env -u GIT_EDITOR pnpm run verify:affected` succeeded; the change
was committed with that evidence.

## Evidence

First run: `pnpm run verify:affected` exit 130, failed task `workspace:test`,
e.g. `src/resolution/sources/git/operations.test.ts` and
`src/lifecycle/install/locator-selection.test.ts`. `echo $GIT_EDITOR` printed
`true`. Second run exit 0.

## Existing context

Sibling sessions in the same work stream recorded the same refusal on the same
day; the export appears to be a property of the agent harness shell, not of the
repository.
